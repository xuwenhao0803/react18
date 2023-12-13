import { Action } from 'shared/ReactTypes'
import { Lane } from './fiberLanes'

export interface Update<State> {
	action: Action<State>
	lane: Lane
	next: Update<any> | null
}

export interface UpdateQueue<State> {
	dispatch: any
	shared: {
		pending: Update<State> | null
	}
}
export const createUpdate = <State>(
	action: Action<State>,
	lane: Lane
): Update<State> => {
	return {
		action,
		lane,
		next: null
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
	const pending = updateQueue.shared.pending
	if (pending === null) {
		update.next = update
	} else {
		update.next = pending.next
		pending.next = update
	}
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
