import {
	SET_OPENAI_API_KEY
} from '../actions.js';

import { ThunkSomeAction } from '../store.js';

export const setOpenAIAPIKey = (key : string) : ThunkSomeAction => (dispatch) => {
	dispatch({
		type: SET_OPENAI_API_KEY,
		key
	});
};
