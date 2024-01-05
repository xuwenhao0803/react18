import { Action } from 'shared/ReactTypes'
import { Lane, NoLane, isSubsetOfLanes } from './fiberLanes'

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
	pendingUpdate: Update<State> | null,
	renderLane: Lane
): {
	memeizedState: State
	baseState: State
	basQueue: Update<State> | null
} => {
	const result: ReturnType<typeof processUpdateQueue<State>> = {
		memeizedState: baseState,
		baseState,
		basQueue: null
	}
	if (pendingUpdate !== null) {
		//第一个update
		const first = pendingUpdate.next
		let pending = pendingUpdate.next

		let newBaseState = baseState
		let newBaseQueueFirst: Update<State> | null = null
		let newBaseQueueLast: Update<State> | null = null
		let newState = baseState

		do {
			const updateLane = pending.lane
			if (!isSubsetOfLanes(renderLane, updateLane)) {
				//优先级不够
				const clone = createUpdate(pending.action, pending.lane)
				//是不是第一个被跳过的
				if (newBaseQueueFirst === null) {
					newBaseQueueFirst = clone
					newBaseQueueLast = clone
					newBaseState = newState
				} else {
					newBaseQueueLast.next = clone
					newBaseQueueLast = clone
				}
			} else {
				if (newBaseQueueLast !== null) {
					const clone = createUpdate(pending.action, NoLane)
					newBaseQueueLast.next = clone
					newBaseQueueLast = clone
				}
				const action = pending.action
				if (action instanceof Function) {
					newState = action(baseState)
				} else {
					newState = action
				}
			}
			pending = pending.next
		} while (pending !== first)
		if (newBaseQueueLast === null) {
			//本次计算没有update被跳过
			newBaseState = newState
		} else {
			newBaseQueueLast.next = newBaseQueueFirst
		}
		result.memeizedState = newState
		result.baseState = newBaseState
		result.basQueue = newBaseQueueLast
	}

	return result
}
