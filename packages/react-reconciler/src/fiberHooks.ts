import internals from 'shared/internals'
import { FiberNode } from './fiber'
import { Dispatch, Dispatcher } from 'react/src/currentDispatcher'
import {
	UpdateQueue,
	createUpdate,
	createUpdateQueue,
	enqueueUpdate,
	processUpdateQueue
} from './updateQueue'
import { Action } from 'shared/ReactTypes'
import { scheduleUpdateOnFiber } from './workLoop'
import { requestUpdateLane } from './fiberLanes'

let currentlyRenderingFiber: FiberNode | null = null

const { currentDispatcher } = internals
let workInProgressHook: Hook | null = null
let currentHook: Hook | null = null
interface Hook {
	memoizedState: any
	updateQueue: unknown
	next: Hook | null
}

export function renderWithHooks(wip: FiberNode) {
	currentlyRenderingFiber = wip
	wip.memoizedState = null
	const current = wip.alternate
	if (current !== null) {
		//update
		currentDispatcher.current = HooksDispatcherOnUpdate
	} else {
		//mount
		currentDispatcher.current = HooksDispatcherOnMount
	}
	const Component = wip.type
	const props = wip.pendingProps
	const children = Component(props)
	currentlyRenderingFiber = null
	workInProgressHook = null
	currentHook = null
	return children
}

const HooksDispatcherOnMount: Dispatcher = {
	useState: mountState
}

const HooksDispatcherOnUpdate: Dispatcher = {
	useState: updateState
}

function updateState<State>(): [State, Dispatch<State>] {
	const hook = updateWorkInProgressHook()

	//计算新state的逻辑
	const queue = hook.updateQueue as UpdateQueue<State>
	const pending = queue.shared.pending
	if (pending !== null) {
		const { memeizedState } = processUpdateQueue(hook.memoizedState, pending)
		hook.memoizedState = memeizedState
	}

	return [hook.memoizedState, queue.dispatch]
}

function mountState<State>(
	initialState: (() => State) | State
): [State, Dispatch<State>] {
	const hook = mountWorkInProgressHook()
	let memoizedState
	if (initialState instanceof Function) {
		memoizedState = initialState()
	} else {
		memoizedState = initialState
	}
	const queue = createUpdateQueue<State>()
	hook.updateQueue = queue
	hook.memoizedState = memoizedState
	const dispatch = dispatchSetState.bind(null, currentlyRenderingFiber, queue)
	//@ts-ignore
	queue.dispatch = dispatch
	return [memoizedState, dispatch]
}

function dispatchSetState<State>(
	fiber: FiberNode,
	updateQueue: UpdateQueue<State>,
	action: Action<State>
) {
	const lane = requestUpdateLane()
	const update = createUpdate(action, lane)
	enqueueUpdate(updateQueue, update)
	scheduleUpdateOnFiber(fiber)
}

function updateWorkInProgressHook(): Hook {
	let nextCurrentHook: Hook | null
	if (currentHook === null) {
		const current = currentlyRenderingFiber?.alternate
		if (current !== null) {
			nextCurrentHook = current?.memoizedState
		} else {
			nextCurrentHook = null
		}
	} else {
		nextCurrentHook = currentHook.next
	}
	if (nextCurrentHook === null) {
		throw new Error(
			`组件${currentlyRenderingFiber.type}本次执行时的hook比上次执行的多`
		)
	}
	currentHook = nextCurrentHook as Hook
	const newHook: Hook = {
		memoizedState: currentHook.memoizedState,
		updateQueue: currentHook.updateQueue,
		next: null
	}
	if (workInProgressHook === null) {
		// mount时 第一个hook
		if (currentlyRenderingFiber === null) {
			throw new Error('请在函数组件内调用hook')
		} else {
			workInProgressHook = newHook
			currentlyRenderingFiber.memoizedState = workInProgressHook
		}
	} else {
		//mount时 后续的hook
		workInProgressHook.next = newHook
		workInProgressHook = newHook
	}
	return workInProgressHook
}

function mountWorkInProgressHook(): Hook {
	const hook: Hook = {
		memoizedState: null,
		updateQueue: null,
		next: null
	}
	if (workInProgressHook === null) {
		// mount时 第一个hook
		if (currentlyRenderingFiber === null) {
			throw new Error('请在函数组件内调用hook')
		} else {
			workInProgressHook = hook
			currentlyRenderingFiber.memoizedState = workInProgressHook
		}
	} else {
		//mount时 后续的hook
		workInProgressHook.next = hook
		workInProgressHook = hook
	}
	return workInProgressHook
}
