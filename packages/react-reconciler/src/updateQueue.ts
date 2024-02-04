import { Action } from 'shared/ReactTypes'
import { Lane, NoLane, isSubsetOfLanes, mergeLanes } from './fiberLanes'
import { FiberNode } from './fiber'

export interface Update<State> {
	action: Action<State>
	lane: Lane
	next: Update<any> | null
	hasEagerState: boolean
	eagerState: State | null
}

export interface UpdateQueue<State> {
	dispatch: any
	shared: {
		pending: Update<State> | null
	}
}
export const createUpdate = <State>(
	action: Action<State>,
	lane: Lane,
	hasEagerState = false,
	eagerState = null
): Update<State> => {
	return {
		action,
		lane,
		next: null,
		hasEagerState,
		eagerState
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
	update: Update<State>,
	fiber: FiberNode,
	lane: Lane
) => {
	const pending = updateQueue.shared.pending
	if (pending === null) {
		update.next = update
	} else {
		update.next = pending.next
		pending.next = update
	}
	updateQueue.shared.pending = update
	fiber.lanes = mergeLanes(fiber.lanes, lane)
	const alternate = fiber.alternate
	if (alternate !== null) {
		alternate.lanes = mergeLanes(alternate.lanes, lane)
	}
}
export function basicStateReducer<State>(
	state: State,
	action: Action<State>
): State {
	if (action instanceof Function) {
		return action(state)
	} else {
		return action
	}
}
export const processUpdateQueue = <State>(
	baseState: State,
	pendingUpdate: Update<State> | null,
	renderLane: Lane,
	onSkipUpdate?: <State>(update: Update<State>) => void
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
				onSkipUpdate?.(clone)
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
				if (pending.hasEagerState) {
					newState = pending.eagerState
				} else {
					newState = basicStateReducer(baseState, action)
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
