import {
	z
} from 'zod';

import {
	sproutDataMapSchema,
	sproutLocationSchema
} from './types.js';

import {
	imageURLSchema,
	packagedSproutSchema,
	promptSchema,
	sproutNameSchema,
	sproutStateSchema
} from '../src/types.js';

export const UPDATE_PAGE = 'UPDATE_PAGE';
export const UPDATE_OFFLINE = 'UPDATE_OFFLINE';
export const UPDATE_HASH = 'UPDATE_HASH';

export const ADD_SPROUTS = 'ADD_SPROUTS';
export const SELECT_SPROUT = 'SELECT_SPROUT';
export const SET_OPENAI_API_KEY = 'SET_OPENAI_API_KEY';
export const START_STREAMING_SPROUT = 'START_STREAMING_SPROUT';
export const STREAM_INCREMENTAL_MESSAGE = 'STREAM_INCREMENTAL_MESSAGE';
export const SPROUT_PROVIDED_USER_RESPONSE = 'SPROUT_PROVIDED_USER_RESPONSE';
export const SPROUT_STOPPED_STREAMING = 'SPROUT_STOPPED_STREAMING';
export const UPDATE_DRAFT_MESSAGE = 'UPDATE_DRAFT_MESSAGE';
export const ATTACH_IMAGE = 'ATTACH_IMAGE';
export const OPEN_EDITOR = 'OPEN_EDITOR';
export const CLOSE_EDITOR = 'CLOSE_EDITOR';
export const START_EDITING = 'START_EDITING';
export const WRITE_SPROUT = 'WRITE_SPROUT';

const actionUpdatePage = z.object({
	type: z.literal(UPDATE_PAGE),
	page: z.string(),
	pageExtra: z.string()
}).strict();

const actionUpdateOffline = z.object({
	type: z.literal(UPDATE_OFFLINE),
	offline: z.boolean()
}).strict();

export type ActionUpdateOffline = z.infer<typeof actionUpdateOffline>;

const actionUpdateHash = z.object({
	type: z.literal(UPDATE_HASH),
	hash: z.string()
}).strict();

const actionAddSprouts = z.object({
	type: z.literal(ADD_SPROUTS),
	sprouts: sproutDataMapSchema,
}).strict();

const actionSelectSprout = z.object({
	type: z.literal(SELECT_SPROUT),
	sprout: sproutLocationSchema
}).strict();

const actionSetOpenAPIKey = z.object({
	type: z.literal(SET_OPENAI_API_KEY),
	key: z.string()
}).strict();

const actionStartStreamingSprout = z.object({
	type: z.literal(START_STREAMING_SPROUT)
}).strict();

const actionStreamIncrementalMessage = z.object({
	type: z.literal(STREAM_INCREMENTAL_MESSAGE)
}).strict();

const actionSproutStoppedStreaming = z.object({
	type: z.literal(SPROUT_STOPPED_STREAMING),
	state: sproutStateSchema
}).strict();

const actionSproutProvidedUserResponse = z.object({
	type: z.literal(SPROUT_PROVIDED_USER_RESPONSE),
	response: promptSchema
}).strict();

const actionUpdateDraftMessage = z.object({
	type: z.literal(UPDATE_DRAFT_MESSAGE),
	message: z.string()
}).strict();

const actionAttachImage = z.object({
	type: z.literal(ATTACH_IMAGE),
	image: z.union([imageURLSchema, z.literal(null)])
}).strict();

const actionOpenEditor = z.object({
	type: z.literal(OPEN_EDITOR),
}).strict();

const actionCloseEditor = z.object({
	type: z.literal(CLOSE_EDITOR),
}).strict();

const actionStartEditing = z.object({
	type: z.literal(START_EDITING),
}).strict();

const actionWriteSprout = z.object({
	type: z.literal(WRITE_SPROUT),
	name: sproutNameSchema,
	sprout: packagedSproutSchema
}).strict();

const someAction = z.discriminatedUnion('type', [
	actionUpdatePage,
	actionUpdateOffline,
	actionUpdateHash,
	actionAddSprouts,
	actionSelectSprout,
	actionSetOpenAPIKey,
	actionStartStreamingSprout,
	actionStreamIncrementalMessage,
	actionSproutStoppedStreaming,
	actionSproutProvidedUserResponse,
	actionUpdateDraftMessage,
	actionAttachImage,
	actionOpenEditor,
	actionCloseEditor,
	actionStartEditing,
	actionWriteSprout
]);

export type SomeAction = z.infer<typeof someAction>;