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
import { Lane, NoLane, requestUpdateLane } from './fiberLanes'
import { Flags, PassiveEffect } from './fiberFlags'
import { HookHasEffect, Passive } from './hookEffectTags'

let currentlyRenderingFiber: FiberNode | null = null

const { currentDispatcher } = internals
let workInProgressHook: Hook | null = null
let currentHook: Hook | null = null
let renderLane: Lane = NoLane

interface Hook {
	memoizedState: any
	updateQueue: unknown
	next: Hook | null
}

export interface Effect {
	tag: Flags
	create: EffectCallback | void
	destroy: EffectCallback | void
	deps: EffectDeps
	next: Effect | null
}

export interface FCUpdateQueue<State> extends UpdateQueue<State> {
	lastEffect: Effect | null
}

type EffectCallback = () => void
type EffectDeps = any[] | null

export function renderWithHooks(wip: FiberNode, lane: Lane) {
	currentlyRenderingFiber = wip
	//重置hooks链表
	wip.memoizedState = null
	//充值effectList
	wip.updateQueue = null

	const current = wip.alternate
	renderLane = lane
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
	renderLane = NoLane
	return children
}

const HooksDispatcherOnMount: Dispatcher = {
	useState: mountState,
	useEffect: mountEffect
}

const HooksDispatcherOnUpdate: Dispatcher = {
	useState: updateState,
	useEffect: updateEffect
}

function mountEffect(create: EffectCallback | void, deps: EffectDeps) {
	const hook = mountWorkInProgressHook()
	const nextDeps = deps === undefined ? null : deps
	currentlyRenderingFiber.flags |= PassiveEffect
	hook.memoizedState = pushEffect(
		Passive | HookHasEffect,
		create,
		undefined,
		nextDeps
	)
}

function updateEffect(create: EffectCallback | void, deps: EffectDeps) {
	const hook = updateWorkInProgressHook()
	const nextDeps = deps === undefined ? null : deps
	let destroy: EffectCallback | void

	if (currentHook !== null) {
		const preEffect = currentHook.memoizedState as Effect
		destroy = preEffect.destroy
		if (nextDeps !== null) {
			//浅比较依赖
			const prevDeps = preEffect.deps
			if (arteHookInputsEqual(nextDeps, prevDeps)) {
				hook.memoizedState = pushEffect(Passive, create, destroy, nextDeps)
				return
			}
		}
		currentlyRenderingFiber.flags |= PassiveEffect
		hook.memoizedState = pushEffect(
			Passive | HookHasEffect,
			create,
			destroy,
			nextDeps
		)
	}
}

function arteHookInputsEqual(nextDeps: EffectDeps, prevDeps: EffectDeps) {
	if (prevDeps === null || nextDeps === null) {
		return false
	}
	for (let i = 0; i < prevDeps.length && i < nextDeps.length; i++) {
		if (Object.is(prevDeps[i], nextDeps[i])) {
			continue
		}
		return false
	}
	return true
}

function pushEffect(
	hookFlags: Flags,
	create: EffectCallback | void,
	destroy: EffectCallback | void,
	deps: EffectDeps
): Effect {
	const effect: Effect = {
		tag: hookFlags,
		create,
		destroy,
		deps,
		next: null
	}
	const fiber = currentlyRenderingFiber as FiberNode
	const updateQueue = fiber.updateQueue as FCUpdateQueue<any>
	if (updateQueue === null) {
		const updateQueue = createFCUpdateQueue()
		fiber.updateQueue = updateQueue
		effect.next = effect
		updateQueue.lastEffect = effect
	} else {
		const lastEffect = updateQueue.lastEffect
		if (lastEffect === null) {
			effect.next = effect
			updateQueue.lastEffect = effect
		} else {
			const firstEffect = lastEffect.next
			lastEffect.next = effect
			effect.next = firstEffect
			updateQueue.lastEffect = effect
		}
	}
	return effect
}

function createFCUpdateQueue<State>() {
	const updateQueue = createUpdateQueue<State>() as FCUpdateQueue<State>
	updateQueue.lastEffect = null
	return updateQueue
}

function updateState<State>(): [State, Dispatch<State>] {
	const hook = updateWorkInProgressHook()

	//计算新state的逻辑
	const queue = hook.updateQueue as UpdateQueue<State>
	const pending = queue.shared.pending
	queue.shared.pending = null
	if (pending !== null) {
		const { memeizedState } = processUpdateQueue(
			hook.memoizedState,
			pending,
			renderLane
		)
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
	scheduleUpdateOnFiber(fiber, lane)
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
