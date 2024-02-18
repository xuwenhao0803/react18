import internals from 'shared/internals'
import { FiberNode } from './fiber'
import { Dispatch, Dispatcher } from 'react/src/currentDispatcher'
import currentBatchConfig from 'react/src/currentBatchConfig'
import {
	Update,
	UpdateQueue,
	basicStateReducer,
	createUpdate,
	createUpdateQueue,
	enqueueUpdate,
	processUpdateQueue
} from './updateQueue'
import { Action, ReactContext, Thenable, Usable } from 'shared/ReactTypes'
import { scheduleUpdateOnFiber } from './workLoop'
import {
	Lane,
	NoLane,
	NoLanes,
	mergeLanes,
	removeLanes,
	requestUpdateLane
} from './fiberLanes'
import { Flags, PassiveEffect } from './fiberFlags'
import { HookHasEffect, Passive } from './hookEffectTags'
import { REACT_CONTEXT_TYPE } from 'shared/ReactSymbols'
import { trackUsedThenable } from './thenable'
import { markWipReceivedUpdate } from './beginWork'
import { readContext as readContextOrigin } from './fiberContext'

let currentlyRenderingFiber: FiberNode | null = null

const { currentDispatcher } = internals
let workInProgressHook: Hook | null = null
let currentHook: Hook | null = null
let renderLane: Lane = NoLane

function readContext<Value>(context: ReactContext<Value>): Value {
	const consumer = currentlyRenderingFiber as FiberNode
	return readContextOrigin(consumer, context)
}

interface Hook {
	memoizedState: any
	updateQueue: unknown
	next: Hook | null
	baseState: any
	baseQueue: Update<any> | null
}

export interface Effect {
	tag: Flags
	create: EffectCallback | void
	destroy: EffectCallback | void
	deps: HookDeps
	next: Effect | null
}

export interface FCUpdateQueue<State> extends UpdateQueue<State> {
	lastEffect: Effect | null
	lastRenderState: State
}

type EffectCallback = () => void
export type HookDeps = any[] | null

export function renderWithHooks(
	wip: FiberNode,
	Component: FiberNode['type'],
	lane: Lane
) {
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
	// const Component = wip.type
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
	useEffect: mountEffect,
	useTransition: mountTransition,
	useRef: mountRef,
	useContext: readContext,
	use: use,
	useMemo: mountMemo,
	useCallback: mountCallback
}

const HooksDispatcherOnUpdate: Dispatcher = {
	useState: updateState,
	useEffect: updateEffect,
	useTransition: updateTransition,
	useRef: updateRef,
	useContext: readContext,
	use: use,
	useMemo: updateMemo,
	useCallback: updateCallback
}

function mountEffect(create: EffectCallback | void, deps: HookDeps) {
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

function updateEffect(create: EffectCallback | void, deps: HookDeps) {
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

function arteHookInputsEqual(nextDeps: HookDeps, prevDeps: HookDeps) {
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
	deps: HookDeps
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
	const queue = hook.updateQueue as FCUpdateQueue<State>
	const baseState = hook.baseState
	const pending = queue.shared.pending
	//update保存在current中
	const current = currentHook
	let baseQueue = current.baseQueue

	if (pending !== null) {
		//pending baseQueue update保存在current中

		if (baseQueue !== null) {
			const baseFirst = baseQueue.next
			const pendingFirst = pending.next

			baseQueue.next = pendingFirst
			pending.next = baseFirst
		}
		baseQueue = pending
		//保存在current
		current.baseQueue = pending
		queue.shared.pending = null
	}
	if (baseQueue !== null) {
		const prevState = hook.memoizedState
		const {
			memeizedState,
			basQueue: newBaseQueue,
			baseState: newBaseState
		} = processUpdateQueue(baseState, baseQueue, renderLane, (update) => {
			const skippedLane = update.lane
			const fiber = currentlyRenderingFiber as FiberNode
			fiber.lanes = mergeLanes(fiber.lanes, skippedLane)
		})
		if (!Object.is(prevState, memeizedState)) {
			markWipReceivedUpdate()
		}
		hook.memoizedState = memeizedState
		hook.baseState = newBaseState
		hook.baseQueue = newBaseQueue
		queue.lastRenderState = memeizedState
	}
	return [hook.memoizedState, queue.dispatch]
}

function mountRef<T>(initialValue: T): { current: T } {
	const hook = mountWorkInProgressHook()
	const ref = { current: initialValue }
	hook.memoizedState = ref
	return ref
}

function updateRef<T>(initialValue: T): { current: T } {
	const hook = updateWorkInProgressHook()

	return hook.memoizedState
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
	const queue = createFCUpdateQueue<State>()
	hook.updateQueue = queue
	hook.memoizedState = memoizedState
	hook.baseState = memoizedState
	const dispatch = dispatchSetState.bind(null, currentlyRenderingFiber, queue)
	//@ts-ignore
	queue.dispatch = dispatch
	queue.lastRenderState = memoizedState
	return [memoizedState, dispatch]
}

function mountTransition(): [boolean, (callback: () => void) => void] {
	const [isPending, setPending] = mountState(false)
	const hook = mountWorkInProgressHook()
	const start = startTransition.bind(null, setPending)
	hook.memoizedState = start
	return [isPending, start]
}

function updateTransition(): [boolean, (callback: () => void) => void] {
	const [isPending] = updateState()
	const hook = updateWorkInProgressHook()
	const start = hook.memoizedState
	return [isPending as boolean, start]
}

function startTransition(setPending: Dispatch<boolean>, callback: () => void) {
	setPending(true)
	const prevTransition = currentBatchConfig.transition
	currentBatchConfig.transition = 1
	callback()
	setPending(false)
	currentBatchConfig.transition = prevTransition
}

function dispatchSetState<State>(
	fiber: FiberNode,
	updateQueue: FCUpdateQueue<State>,
	action: Action<State>
) {
	const lane = requestUpdateLane()
	const update = createUpdate(action, lane)

	//eager策略
	const current = fiber.alternate
	console.log('fiber.lanes', fiber)

	if (
		fiber.lanes === NoLanes &&
		(current === null || current.lanes === NoLanes)
	) {
		//当前产生的update是这个fiber的第一个update
		const currentState = updateQueue.lastRenderState
		const eagerState = basicStateReducer(currentState, action)
		update.hasEagerState = true
		update.eagerState = eagerState

		if (Object.is(currentState, eagerState)) {
			console.warn('命中eagerstate')

			enqueueUpdate(updateQueue, update, fiber, NoLane)
			return
		}
	}
	enqueueUpdate(updateQueue, update, fiber, lane)
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
		next: null,
		baseQueue: currentHook.baseQueue,
		baseState: currentHook.baseState
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
		next: null,
		baseQueue: null,
		baseState: null
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

function use<T>(usable: Usable<T>): T {
	if (usable !== null && typeof usable === 'object') {
		if (typeof (usable as Thenable<T>).then === 'function') {
			const thenable = usable as Thenable<T>
			return trackUsedThenable(thenable)
		} else if ((usable as ReactContext<T>).$$typeof === REACT_CONTEXT_TYPE) {
			const context = usable as ReactContext<T>
			return readContext(context)
		}
	}
	throw new Error('不支持的use参数' + usable)
}

export function resetHooksOnUnwind() {
	currentlyRenderingFiber = null
	currentHook = null
	workInProgressHook = null
}

export function bailoutHook(wip: FiberNode, renderLane: Lane) {
	const current = wip.alternate as FiberNode
	wip.updateQueue = current.updateQueue
	wip.flags &= ~PassiveEffect
	current.lanes = removeLanes(current.lanes, renderLane)
}

function mountCallback<T>(callback: T, deps: HookDeps | undefined) {
	const hook = mountWorkInProgressHook()
	const nextDeps = deps === undefined ? null : deps
	hook.memoizedState = [callback, nextDeps]
	return callback
}

function updateCallback<T>(callback: T, deps: HookDeps | undefined) {
	const hook = updateWorkInProgressHook()
	const nextDeps = deps === undefined ? null : deps
	const prevState = hook.memoizedState
	if (nextDeps !== null) {
		const prevDeps = prevState[1]
		if (arteHookInputsEqual(nextDeps, prevDeps)) {
			return prevState[0]
		}
	}
	hook.memoizedState = [callback, nextDeps]
	return callback
}

function mountMemo<T>(nextCreate: () => T, deps: HookDeps | undefined) {
	const hook = mountWorkInProgressHook()
	const nextDeps = deps === undefined ? null : deps
	const nextValue = nextCreate()
	hook.memoizedState = [nextValue, nextDeps]
	return nextValue
}

function updateMemo<T>(nextCreate: () => T, deps: HookDeps | undefined) {
	const hook = updateWorkInProgressHook()
	const nextDeps = deps === undefined ? null : deps
	const prevState = hook.memoizedState
	if (nextDeps !== null) {
		const prevDeps = prevState[1]
		if (arteHookInputsEqual(nextDeps, prevDeps)) {
			return prevState[0]
		}
	}
	const nextValue = nextCreate()
	hook.memoizedState = [nextValue, nextDeps]
	return nextValue
}
