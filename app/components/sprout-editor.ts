import { css, html, PropertyValues, TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { connect } from 'pwa-helpers/connect-mixin.js';

// This element is connected to the Redux store.
import { store } from '../store.js';

import {
	DialogElement
} from './dialog-element.js';

import {
	RootState
} from '../types_store.js';

import {
	CHECK_CIRCLE_OUTLINE_ICON
} from './my-icons.js';

import {
	SharedStyles
} from './shared-styles.js';

import {
	ButtonSharedStyles
} from './button-shared-styles.js';

import {
	setEditorOpen
} from '../actions/data.js';

import {
	selectCurrentSprout,
	selectEditorOpen
} from '../selectors.js';

import {
	Sprout
} from '../../src/sprout.js';

import {
	SproutConfig
} from '../../src/types.js';

import {
	TypedObject
} from '../../src/typed-object.js';

@customElement('sprout-editor')
export class SproutEditor extends connect(store)(DialogElement) {
	
	@state()
		_currentSprout : Sprout | null = null;

	@state()
		_sproutBaseInstructions : string = '';

	@state()
		_sproutSchemaText : string = '';

	@state()
		_sproutConfig : SproutConfig | null = null;

	@state()
		_editable = false;

	static override get styles() {
		return [
			...DialogElement.styles,
			SharedStyles,
			ButtonSharedStyles,
			css`
				.buttons {
					display: flex;
					justify-content: flex-end;
				}

				textarea {
					flex: 1;
				}
			`
		];
	}

	override stateChanged(state : RootState) {
		this.open = selectEditorOpen(state);
		this._currentSprout = selectCurrentSprout(state);
	}

	private sproutChanged() {
		if (!this._currentSprout) return;
		this._sproutBaseInstructions = '';
		this._currentSprout.baseInstructions().then(baseInstructions => {
			this._sproutBaseInstructions = baseInstructions;
		});
		this._sproutSchemaText = '';
		this._currentSprout.schemaText().then(schemaText => {
			this._sproutSchemaText = schemaText;
		});
		this._sproutConfig = null;
		this._currentSprout.config().then(config => {
			this._sproutConfig = config;
		});
	}

	override updated(changedProps : PropertyValues<this>) {
		if (changedProps.has('_currentSprout') && this._currentSprout) {
			//Don't call store.dispatch things in the update.
			setTimeout(() => this.sproutChanged(), 0);
		}
	}

	closeDialog() {
		store.dispatch(setEditorOpen(false));
	}

	private rowForConfig(key : keyof SproutConfig, value : unknown) : TemplateResult {
		return html`<li><label>${key}</label> <em>${value}</em></li>`;
	}

	override innerRender() : TemplateResult {

		const sprout = this._currentSprout;

		if (!sprout) return html`No sprout.`;

		return html`
			<h2>${sprout.name}</h2>
			<label>Instructions</label>
			<textarea ?disabled=${!this._editable}>${this._sproutBaseInstructions}</textarea>
			<label>Schema</label>
			<textarea ?disabled=${!this._editable}>${this._sproutSchemaText || 'No schema'}</textarea>
			<details open>
				<summary><label>Config</label></summary>
				<div>
					${this._sproutConfig
		? html`<ul>${TypedObject.entries(this._sproutConfig).map(([key, value]) => this.rowForConfig(key, value))}</ul>`
		: html`<em>No config</em>`}
				</div>
			</details>
		`;
	}

	override _shouldClose(_cancelled : boolean) {
		this.closeDialog();
	}

	override buttonsRender() : TemplateResult {
		return html`
		<button class='round default' @click=${this.closeDialog}>${CHECK_CIRCLE_OUTLINE_ICON}</button>
	`;
	}

}

declare global {
	interface HTMLElementTagNameMap {
		'sprout-editor': SproutEditor;
	}
}
