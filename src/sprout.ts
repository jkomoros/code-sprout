import {
	fileExists,
	fileFetch,
	joinPath
} from './fetcher.js';

import {
	AIProvider
} from './llm.js';

import {
	Logger,
	Path,
	SproutConfig,
	SproutName,
	SproutState,
	StreamLogger,
	partialConversationTurnSchema,
	sproutConfigSchema,
	strictConversationTurnSchema
} from './types.js';

import {
	StreamingJSONParser
} from './streaming-json.js';

import fastJSONPatch from 'fast-json-patch';

//Relative to the sprout root
const SPROUT_CONFIG_PATH = 'config.json';
const SPROUT_INSTRUCTIONS_PATH = 'instructions.md';
const SPROUT_SCHEMA_PATH = 'schema.ts';

//A manual conversion of types.ts:conversationTurnSchema
const CONVERSATION_TURN_SCHEMA = `type ConversationTurn = {
  //The message that will be shown to the user.
  userMessage: string
  //The change to make to the current state object based on this turn. If no modification needs to be made, can just be [].
  patch : JSONPatchRFC6902
}`;

//Set true while debugging
const AGGRESSIVE_LOGGING = false;

export class Sprout {
	_path : Path;
	_config?: SproutConfig;
	_baseInstructions? : string;
	_schemaText? : string;
	_aiProvider? : AIProvider;
	_userMessages : string[];
	_states: SproutState[];

	constructor(path : Path, ai? : AIProvider) {
		this._path = path;
		this._aiProvider = ai;
		this._userMessages = [];
		this._states = [];
	}

	get name() : SproutName {
		//TODO: return the last path component
		return this._path;
	}

	async config() : Promise<SproutConfig> {
		if (!this._config) {
			const sproutConfigPath = joinPath(this._path, SPROUT_CONFIG_PATH);
			if (!await fileExists(sproutConfigPath)) {
				throw new Error(`${this.name}: Config file ${sproutConfigPath} not found`);
			}
			const configData = await fileFetch(sproutConfigPath);
			//Tnis will throw if invalid shape.
			const config = sproutConfigSchema.parse(JSON.parse(configData));
			if (!config) throw new Error(`${this.name}: No config`);
			this._config = config;
		}
		if (!this._config) throw new Error(`${this.name}: Couldn't create sprout`);
		return this._config;
	}

	async baseInstructions() : Promise<string> {
		if (this._baseInstructions === undefined) {
			const sproutInstructionsPath = joinPath(this._path, SPROUT_INSTRUCTIONS_PATH);
			if (!await fileExists(sproutInstructionsPath)) {
				throw new Error(`${this.name}: Instruction file ${sproutInstructionsPath} not found`);
			}
			this._baseInstructions = await fileFetch(sproutInstructionsPath);
		}
		if (this._baseInstructions === undefined) throw new Error(`${this.name}: No instructions`);
		return this._baseInstructions;
	}

	async schemaText() : Promise<string> {
		if (this._schemaText === undefined) {
			const sproutSchemaPath = joinPath(this._path, SPROUT_SCHEMA_PATH);
			if (!await fileExists(sproutSchemaPath)) {
				throw new Error(`${this.name}: Schema file ${sproutSchemaPath} not found`);
			}
			//TODO: validate this is valid typescript
			this._schemaText = await fileFetch(sproutSchemaPath);
		}
		if (this._schemaText === undefined) throw new Error(`${this.name}: No schema`);
		return this._schemaText;
	}

	//throws if invalid
	async validate() : Promise<void> {
		//Will throw if invalid
		await this.config();
		await this.baseInstructions();
		await this.schemaText();
	}

	async starterState() : Promise<SproutState> {
		//TODO: don't use an LLM for this / cache the result so we don't have to run it each time
		if (!this._aiProvider) throw new Error('This currently requires an AI provider');
		const schemaText = await this.schemaText();
		const prompt = `Return the JSON of a default/empty object conforming to this typescript schema (following comments on defaults):
${schemaText}
`;
		const rawJSON = await this._aiProvider.prompt(prompt, {
			jsonResponse: true,
			modelRequirements: {
				jsonResponse: true
			}
		});
		return JSON.parse(rawJSON);
	}

	async lastState() : Promise<SproutState> {
		if (this._states.length == 0) {
			this._states.push(await this.starterState());
		}
		return this._states[this._states.length -1];
	}

	//Returns the next prompt to return.
	async prompt() : Promise<string> {
		const baseInstructions = await this.baseInstructions();
		const schemaText = await this.schemaText();

		const state = await this.lastState();

		return `${baseInstructions}

You will manage your state in an object conforming to the following schema:
${schemaText}

Do not talk about the state object with a user; it is an implementation detail the user doesn't need to know about.

Your current state is:
${JSON.stringify(state, null, '\t')}

The last messages from the user (with the last message, which you should respond to, at the end):
${this._userMessages.length ? this._userMessages.join('\n---\n') : '<INITIAL>'}

You should respond with only a literal JSON object (not wrapped in markdown formatting) matching this schema:
${CONVERSATION_TURN_SCHEMA}

Provide a patch to update the state object based on the users's last message and your response.`;
	}

	provideUserResponse(response : string) : void {
		this._userMessages.push(response);
	}

	/*
		conversationTurn does the next LLM turn of a discussion, as visible to a
		user.

		It prompts the LLM with the current state and last received user message
		(via provideUserResponse).

		It returns the next message to show to the user. The calling context
		should display it to the user, pass any new response from a user via
		provideUserResponse, and then call conversationTurn() again.
	*/
	async conversationTurn(streamLogger? : StreamLogger, debugLogger? : Logger) : Promise<string> {
		if (!this._aiProvider) throw new Error('No AI provider');
		const config = await this.config();
		const prompt = await this.prompt();
		if (debugLogger) debugLogger(`Prompt:\n${prompt}`);
		const stream = await this._aiProvider.promptStream(prompt, {
			jsonResponse: true,
			debugLogger,
			modelRequirements: {
				//It's not possible to allowImages and imageInput at the same time currently.
				jsonResponse: !config.allowImages,
				imageInput: config.allowImages || false
			}
		});
		let response = '';
		const parser = new StreamingJSONParser();
		for await (const chunk of stream) {
			if (chunk.choices.length == 0) throw new Error('No choices');
			if (debugLogger && AGGRESSIVE_LOGGING) debugLogger('Chunk:\n' + JSON.stringify(chunk, null, '\t'));
			const choice = chunk.choices[0];
			if (choice.finish_reason && choice.finish_reason != 'stop') throw new Error(`Unexpected chunk stop reason: ${choice.finish_reason}`);
			const content = choice.delta.content || '';
			if (streamLogger) {
				//If we have a debugLogger then we are in debug mode and should
				//log the raw token. But if we don't, log the net new
				//userMessage token.
				if (debugLogger) {
					streamLogger(content);
				} else {
					streamLogger(
						parser.incrementalProperty(content, (input: unknown) : string => {
							return partialConversationTurnSchema.parse(input).userMessage || '';
						})
					);
				}
			}
			response += content;
		}
		//Add a newline at the end for the next line
		if (streamLogger) streamLogger('\n');
		if (debugLogger && AGGRESSIVE_LOGGING) debugLogger(`Raw Turn: ${response}`);
		let turnJSON : unknown = {};
		try {
			turnJSON = JSON.parse(response);
		} catch(err) {
			throw new Error(`Could not parse JSON: ${response}: ${err}`);
		}
		const turn = strictConversationTurnSchema.parse(turnJSON);
		if (debugLogger) debugLogger(`Turn:\n${JSON.stringify(turn, null, '\t')}`);
		const oldState = await this.lastState();
		//TODO: fix typing to not need this cast
		//eslint-disable-next-line @typescript-eslint/no-explicit-any
		const newState = fastJSONPatch.applyPatch(oldState, turn.patch as any).newDocument;
		this._states.push(newState);
		if (debugLogger) debugLogger(`New State:\n${JSON.stringify(newState, null, '\t')}`);
		return turn.userMessage;
	}
}