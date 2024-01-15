import {
	Fetcher,
	FileListingType,
	Path
} from './types.js';

import browser from './fetcher-browser.js';

class MetaFetcher {

	private _default : Fetcher;
	private _fetchers : Record<Path, Fetcher> = {};

	constructor(def : Fetcher) {
		this._default = def;
		this._fetchers = {};
	}

	get localWriteablePath() : string {
		throw new Error('MetaFetcher doesn\'t support localWriteablePath');
	}

	set localWriteablePath(path : string) {
		throw new Error('MetaFetcher doesn\'t support localWriteablePath');
	}

	pathIsLocalWriteable(_path : string) : boolean {
		return false;
	}

	private fetcherForPath(path : Path) : Fetcher {
		for (const prefix of Object.keys(this._fetchers)) {
			if (path.startsWith(prefix)) {
				return this._fetchers[prefix];
			}
		}
		return this._default;
	}

	fileFetch(path : Path) : Promise<string> {
		return this.fetcherForPath(path).fileFetch(path);
	}

	fileExists(path : Path) : Promise<boolean> {
		return this.fetcherForPath(path).fileExists(path);
	}

	listDirectory(path : Path, type : FileListingType) : Promise<Path[]> {
		return this.fetcherForPath(path).listDirectory(path, type);
	}

	writeable(path : Path) : boolean {
		return this.fetcherForPath(path).writeable(path);
	}
	
	async listSprouts() : Promise<Path[]> {
		
		const defaultSprouts = await this._default.listSprouts();
		const result : Path[] = [...defaultSprouts];
		for (const fetcher of Object.values(this._fetchers)) {
			const sprouts = await fetcher.listSprouts();
			result.push(...sprouts);
		}
		return result;
	}


}

const metaFetcher : Fetcher = new MetaFetcher(browser);

export default metaFetcher;