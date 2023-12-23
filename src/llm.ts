import {
	computePromptOpenAI,
	computePromptStreamOpenAI,
	computeTokenCountOpenAI
} from './openai.js';

import {
	CompletionInfo,
	CompletionModelID,
	Environment,
	ModelProvider,
	PromptOptions,
	PromptStream,
	modelProvider
} from './types.js';

import {
	assertUnreachable
} from './util.js';

export const extractModel = (model : CompletionModelID) : [name : ModelProvider, modelName : string] => {
	const parts = model.split(':');
	if (parts.length != 2) throw new Error('Model didn\'t have : as expected');
	return [modelProvider.parse(parts[0]), parts[1]];
};

const BASE_OPENAI_COMPLETION_INFO = {
	compute: computePromptOpenAI,
	computeStream: computePromptStreamOpenAI
};

export const COMPLETIONS_BY_MODEL : {[name in CompletionModelID] : CompletionInfo } = {
	'openai.com:gpt-3.5-turbo': {
		...BASE_OPENAI_COMPLETION_INFO,
		maxTokens: 4096
	},
	'openai.com:gpt-3.5-turbo-16k': {
		...BASE_OPENAI_COMPLETION_INFO,
		//According to gpt-3.5-turbo-16k
		maxTokens: 16384,
	},
	'openai.com:gpt-4': {
		...BASE_OPENAI_COMPLETION_INFO,
		maxTokens: 8192
	},
	'openai.com:gpt-4-32k': {
		...BASE_OPENAI_COMPLETION_INFO,
		maxTokens: 32768
	},
	'openai.com:gpt-4-1106-preview': {
		...BASE_OPENAI_COMPLETION_INFO,
		maxTokens: 8192,
		supportsJSONResponseFormat: true
	}
};

type ProviderInfo = {
	defaultCompletionModel: CompletionModelID,
	apiKeyVar : keyof Environment
}

export const INFO_BY_PROVIDER : {[name in ModelProvider]: ProviderInfo} = {
	'openai.com': {
		defaultCompletionModel: 'openai.com:gpt-3.5-turbo',
		apiKeyVar: 'openai_api_key'
	}
};

export const computePrompt = async (prompt : string, model: CompletionModelID, env : Environment, opts : PromptOptions = {}) : Promise<string> => {
	//Throw if the completion model is not a valid value

	const [provider, modelName] = extractModel(model);

	const apiKey = env[INFO_BY_PROVIDER[provider].apiKeyVar];
	if (!apiKey) throw new Error ('Unset API key');

	const modelInfo = COMPLETIONS_BY_MODEL[model];

	return modelInfo.compute(modelName, apiKey, prompt, modelInfo, opts);
};

export const computeStream = async (prompt : string, model: CompletionModelID, env : Environment, opts: PromptOptions = {}) : Promise<PromptStream> => {
	//Throw if the completion model is not a valid value

	const [provider, modelName] = extractModel(model);

	const apiKey = env[INFO_BY_PROVIDER[provider].apiKeyVar];
	if (!apiKey) throw new Error ('Unset API key');

	const modelInfo = COMPLETIONS_BY_MODEL[model];

	if (!modelInfo.computeStream) throw new Error(`${modelName} does not support streaming`);

	return modelInfo.computeStream(modelName, apiKey, prompt, modelInfo, opts);
};

export const computeTokenCount = async (text : string, model : CompletionModelID) : Promise<number> => {
	
	const [provider, modelName] = extractModel(model);
	
	//Check to make sure it's a known model in a way that will warn when we add new models.
	switch(provider) {
	case 'openai.com':
		return computeTokenCountOpenAI(modelName, text);
	default:
		assertUnreachable(provider);
	}
	return -1;
};

//Wrap them in one object to pass around instead of passing around state everywhere else.
export class AIProvider {
	_model : CompletionModelID;
	_env : Environment;
	_opts: PromptOptions;

	constructor(model : CompletionModelID, env : Environment, opts : PromptOptions = {}) {
		this._model = model;
		this._env = env;
		this._opts = opts;
	}

	async prompt(text : string, opts : PromptOptions = {}) : Promise<string> {
		return computePrompt(text, this._model, this._env, {...this._opts, ...opts});
	}

	async promptStream(text : string, opts: PromptOptions = {}) : Promise<PromptStream> {
		return computeStream(text, this._model, this._env, {...this._opts, ...opts});
	}

	async tokenCount(text : string) : Promise<number> {
		return computeTokenCount(text, this._model);
	}
}