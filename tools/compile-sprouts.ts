//A node utility that compiles any sprouts that need it.
import nodeFetcher from '../src/fetcher-node.js';

import {
	Sprout
} from '../src/sprout.js';

import {
	AIProvider
} from '../src/llm.js';

import {
	config as dotEnvConfig
} from 'dotenv';

dotEnvConfig();

const compileSprout = async (sproutPath: string, aiProvider : AIProvider): Promise<void> => {
	const sprout = new Sprout(sproutPath, {ai: aiProvider});
	const compiled = await sprout.compiled();
	if (compiled) {
		console.log(`Skipping ${sproutPath} because it is already compiled.`);
		return;
	}
	console.log(`Compiling ${sproutPath}`);
	//Since we have a writeFetcher, we can compile the sprout in place.
	await sprout.compile();
};

const main = async () : Promise<void> => {
	const openAIAPIKey = process.env.OPENAI_API_KEY;
	if (!openAIAPIKey) throw new Error('OPENAI_API_KEY environment variable must be set (.env is OK).');
	const ai = new AIProvider({
		openai_api_key: openAIAPIKey
	});
	for (const sproutPath of await nodeFetcher.listSprouts()) {
		compileSprout(sproutPath, ai);
	}
};

(async () => {
	await main();
})();