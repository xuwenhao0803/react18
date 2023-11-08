import { Action } from 'shared/ReactTypes'

export interface Update<State> {
	action: Action<State>
}

export interface UpdateQueue<State> {
	dispatch: any
	shared: {
		pending: Update<State> | null
	}
}
export const createUpdate = <State>(action: Action<State>): Update<State> => {
	return {
		action
	}
}

export const createUpdateQueue = <State>() => {
	return {
		shared: {
			pending: null
		}
	} as UpdateQueue<State>
}

export const enqueueUpdate = <State>(
	updateQueue: UpdateQueue<State>,
	update: Update<State>
) => {
	updateQueue.shared.pending = update
}

export const processUpdateQueue = <State>(
	baseState: State,
	pendingUpdate: Update<State> | null
): { memeizedState: State } => {
	const result: ReturnType<typeof processUpdateQueue<State>> = {
		memeizedState: baseState
	}
	if (pendingUpdate !== null) {
		const action = pendingUpdate.action
		if (action instanceof Function) {
			result.memeizedState = action(baseState)
		} else {
			result.memeizedState = action
		}
	}
	return result
}
