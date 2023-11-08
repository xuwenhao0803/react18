import internals from 'shared/internals'
import { FiberNode } from './fiber'
import { Dispatch, Dispatcher } from 'react/src/currentDispatcher'
import {
	UpdateQueue,
	createUpdate,
	createUpdateQueue,
	enqueueUpdate
} from './updateQueue'
import { Action } from 'shared/ReactTypes'
import { scheduleUpdateOnFiber } from './workLoop'

let currentlyRenderingFiber: FiberNode | null = null

const { currentDispatcher } = internals
let workInProgressHook: Hook | null = null
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
	} else {
		//mount
		currentDispatcher.current = HooksDispatcherOnMount
	}
	const Component = wip.type
	const props = wip.pendingProps
	const children = Component(props)
	currentlyRenderingFiber = null
	return children
}

const HooksDispatcherOnMount: Dispatcher = {
	useState: mountState
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
	const update = createUpdate(action)
	enqueueUpdate(updateQueue, update)
	scheduleUpdateOnFiber(fiber)
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
