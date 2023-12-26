//TODO: when there's a browser-safe fetcher, use that instead as the default.
import fetcherImpl from './fetcher.js';

import {
	AIProvider,
	debugTextForPrompt,
	promptImages,
	promptIncludesImage,
	textForPrompt
} from './llm.js';

import {
	CompiledSprout,
	Fetcher,
	Logger,
	Path,
	Prompt,
	SproutConfig,
	SproutName,
	SproutState,
	StreamLogger,
	compiledSproutSchema,
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
const SPROUT_COMPILED_PATH = 'compiled.json';
const BASE_SPROUT_PATHS = [SPROUT_INSTRUCTIONS_PATH, SPROUT_SCHEMA_PATH, SPROUT_CONFIG_PATH];

//A manual conversion of types.ts:conversationTurnSchema
const CONVERSATION_TURN_SCHEMA = `type ConversationTurn = {
  //The message that will be shown to the user.
  userMessage: string
  //The change to make to the current state object based on this turn. If no modification needs to be made, can just be [].
  patch : JSONPatchRFC6902
}`;

//Set true while debugging
const AGGRESSIVE_LOGGING = false;

type SproutOptions = {
	ai? : AIProvider,
	debugLogger? : Logger
};

let fetcher : Fetcher = fetcherImpl;

export class Sprout {
	private _path : Path;
	private _config?: SproutConfig;
	// A null means it is affirmatively non existent.
	private _compiledData? : CompiledSprout | null;
	private _baseInstructions? : string;
	private _schemaText? : string;
	private _aiProvider? : AIProvider;
	private _debugLogger? : Logger;
	private _userMessages : Prompt[];
	private _states: SproutState[];

	static setFetcher(input : Fetcher) : void {
		fetcher = input;
	}

	constructor(path : Path, opts : SproutOptions = {}) {
		const {
			ai,
			debugLogger
		} = opts;
		this._path = path;
		this._aiProvider = ai;
		this._debugLogger = debugLogger;
		this._userMessages = [];
		this._states = [];
	}

	get name() : SproutName {
		//TODO: return the last path component
		return this._path;
	}

	async compiled() : Promise<boolean> {
		const compiled = await this._compiled();
		return Boolean(compiled);
	}

	async compile() : Promise<void> {
		if (await this.compiled()) {
			if (this._debugLogger) this._debugLogger(`${this.name}: Already compiled`);
			return;
		}
		if (!fetcher.writable) {
			if (this._debugLogger) this._debugLogger(`${this.name}: Not writable, not compiling`);
			return;
		}
		const result : CompiledSprout = {
			version: 0,
			lastUpdated: new Date().toISOString(),
			name: this.name,
			config: await this.config(),
			baseInstructions: await this.baseInstructions(),
			schemaText: await this.schemaText(),
			starterState: await this.starterState()
		};
		if (this._debugLogger) this._debugLogger(`${this.name}: Compiling`);
		fetcher.writeFile(fetcher.joinPath(this._path, SPROUT_COMPILED_PATH), JSON.stringify(result, null, '\t'));
		this._compiledData = result;
	}

	private async _compiled() : Promise<CompiledSprout | null> {
		if (this._compiledData === undefined) {
			const compiledSproutPath = fetcher.joinPath(this._path, SPROUT_COMPILED_PATH);
			if (await fetcher.fileExists(compiledSproutPath)) {
				const compiledData = await fetcher.fileFetch(compiledSproutPath);
				//Tnis will throw if invalid shape.
				const data = compiledSproutSchema.parse(JSON.parse(compiledData));
				const compiledLastUpdated = new Date(data.lastUpdated);
				if (fetcher.writable) {
					for (const file of BASE_SPROUT_PATHS) {
						const path = fetcher.joinPath(this._path, file);
						if (!await fetcher.fileExists(path)) continue;
						const lastUpdated = await fetcher.fileLastUpdated(path);
						if (lastUpdated > compiledLastUpdated) {
							//If any of the base files are newer than the compiled file, we need to recompile.
							this._compiledData = null;
							if(this._debugLogger) this._debugLogger(`${this.name}: Compiled file out of date: ${path} is newer than ${compiledSproutPath}`);
							return null;
						}
					}
				}
				this._compiledData = data;
			} else {
				if(this._debugLogger) this._debugLogger(`${this.name}: No compiled file`);
				this._compiledData = null;
			}
		}
		return this._compiledData;
	}

	async config() : Promise<SproutConfig> {
		const compiled = await this._compiled();
		if(compiled) return compiled.config;

		if (!this._config) {
			const sproutConfigPath = fetcher.joinPath(this._path, SPROUT_CONFIG_PATH);
			if (!await fetcher.fileExists(sproutConfigPath)) {
				throw new Error(`${this.name}: Config file ${sproutConfigPath} not found`);
			}
			const configData = await fetcher.fileFetch(sproutConfigPath);
			//Tnis will throw if invalid shape.
			const config = sproutConfigSchema.parse(JSON.parse(configData));
			if (!config) throw new Error(`${this.name}: No config`);
			this._config = config;
		}
		if (!this._config) throw new Error(`${this.name}: Couldn't create sprout`);
		return this._config;
	}

	async baseInstructions() : Promise<string> {
		const compiled = await this._compiled();
		if(compiled) return compiled.baseInstructions;

		if (this._baseInstructions === undefined) {
			const sproutInstructionsPath = fetcher.joinPath(this._path, SPROUT_INSTRUCTIONS_PATH);
			if (!await fetcher.fileExists(sproutInstructionsPath)) {
				throw new Error(`${this.name}: Instruction file ${sproutInstructionsPath} not found`);
			}
			this._baseInstructions = await fetcher.fileFetch(sproutInstructionsPath);
		}
		if (this._baseInstructions === undefined) throw new Error(`${this.name}: No instructions`);
		return this._baseInstructions;
	}

	async schemaText() : Promise<string> {
		const compiled = await this._compiled();
		if(compiled) return compiled.schemaText;

		if (this._schemaText === undefined) {
			const sproutSchemaPath = fetcher.joinPath(this._path, SPROUT_SCHEMA_PATH);
			if (!await fetcher.fileExists(sproutSchemaPath)) {
				throw new Error(`${this.name}: Schema file ${sproutSchemaPath} not found`);
			}
			//TODO: validate this is valid typescript
			this._schemaText = await fetcher.fileFetch(sproutSchemaPath);
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
		const compiled = await this._compiled();
		if(compiled) return compiled.starterState;
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
	async prompt() : Promise<Prompt> {
		const baseInstructions = await this.baseInstructions();
		const schemaText = await this.schemaText();

		const state = await this.lastState();

		const instructions = `${baseInstructions}

You will manage your state in an object conforming to the following schema:
${schemaText}

Do not talk about the state object with a user; it is an implementation detail the user doesn't need to know about.

Your current state is:
${JSON.stringify(state, null, '\t')}

The last messages from the user (with the last message, which you should respond to, at the end):
${this._userMessages.length ? this._userMessages.map(message => textForPrompt(message)).join('\n---\n') : '<INITIAL>'}

It is VERY IMPORTANT that you should respond with only a literal JSON object (not wrapped in markdown formatting or other formatting) matching this schema:
${CONVERSATION_TURN_SCHEMA}

Provide a patch to update the state object based on the users's last message and your response.`;

		if (!this._userMessages.length) return instructions;

		const lastMessage = this._userMessages[this._userMessages.length - 1];
		if (promptIncludesImage(lastMessage)) {
			return [
				instructions,
				...promptImages(lastMessage)
			];
		}

		return instructions;

	}

	provideUserResponse(response : Prompt) : void {
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
		if (debugLogger) debugLogger(`Prompt:\n${debugTextForPrompt(prompt)}`);
		const stream = await this._aiProvider.promptStream(prompt, {
			jsonResponse: true,
			debugLogger,
			modelRequirements: {
				//It's not possible to allowImages and imageInput at the same time currently.
				jsonResponse: !config.allowImages,
				imageInput: config.allowImages || false
			}
		});
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
					//TODO: use parser.ingest here and use its final result.
					streamLogger(content);
					parser.ingest(content);
				} else {
					streamLogger(
						parser.incrementalProperty(content, (input: unknown) : string => {
							return partialConversationTurnSchema.parse(input).userMessage || '';
						})
					);
				}
			}
		}
		//Add a newline at the end for the next line
		if (streamLogger) streamLogger('\n');
		if (debugLogger && AGGRESSIVE_LOGGING) {
			debugLogger(`Raw Turn: ${parser.rawInput}`);
			debugLogger(`Trimmed Turn: ${parser.input}`);
		}
		let turnJSON : unknown = {};
		try {
			turnJSON = parser.json();
		} catch(err) {
			throw new Error(`Could not parse JSON: ${parser.input}: ${err}`);
		}
		if (!turnJSON) throw new Error('Empty json');
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