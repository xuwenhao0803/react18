import { scheduleMicroTask } from 'hostConfig'
import { beginWork } from './beginWork'
import {
	commitHookEffectListCreate,
	commitHookEffectListDestory,
	commitHookEffectListUnmount,
	commitLayoutEffects,
	commitMutaionEffects
} from './commintWork'
import { completeWork } from './completeWork'
import {
	FiberNode,
	FiberRootNode,
	PendingPassiveEffects,
	createWorkInProgress
} from './fiber'
import { MutationMask, NoFlags, PassiveMask } from './fiberFlags'
import {
	Lane,
	NoLane,
	SyncLane,
	getHighestPriorityLane,
	getNextLane,
	lanesToSchedulerPriority,
	markRootFinished,
	markRootSuspended,
	mergeLanes
} from './fiberLanes'
import { flushSyncCallbacks, scheduleSyncCallback } from './syncTaskQueue'
import { HostRoot } from './workTags'
import {
	unstable_scheduleCallback as scheduleCallback,
	unstable_NormalPriority as NormalPriority,
	unstable_shouldYield,
	unstable_cancelCallback
} from 'scheduler'
import { HookHasEffect, Passive } from './hookEffectTags'
import { SuspenseException, getSuspensewThenable } from './thenable'
import { resetHooksOnUnwind } from './fiberHooks'
import { throwException } from './fiberThrow'
import { unWindWork } from './fiberUnwindWork'

let workInProgress: FiberNode | null = null
let wipRootRenderLane: Lane = NoLane
let rootDoesHasPassiveEffects: boolean = false

type RootExitStatus = number

//工作中的状态
const RootInProcess = 0

//并发中途打断
const RootInComplete = 1
//render完成
const RootCompleted = 2
//由于挂起，当前是未完成的状态，不用进入commit阶段
const RootDidNotComplete = 3

let wipRootExitStatus: number

type SuspendedReason = typeof NotSuspended | typeof SupendedOnData

const NotSuspended = 0

const SupendedOnData = 1

let wipSuspendedReason: SuspendedReason = NotSuspended

let wipThrownValue: any = null

function prepareRefreshStack(root: FiberRootNode, lane: Lane) {
	root.finishedlane = NoLane
	root.finishedWork = null
	workInProgress = createWorkInProgress(root.current, {})
	wipRootRenderLane = lane
	wipRootExitStatus = RootInProcess
	wipSuspendedReason = NotSuspended
	wipThrownValue = null
}

export function scheduleUpdateOnFiber(fiber: FiberNode, lane: Lane) {
	const root = markUpdateLaneFromFiberRoRoot(fiber, lane)
	markRootUpdated(root, lane)
	ensureRootIsScheduled(root)
}

//调度阶段入口
export function ensureRootIsScheduled(root: FiberRootNode) {
	const updateLane = getNextLane(root)
	const existingCallback = root.callbackNode

	if (updateLane === NoLane) {
		if (existingCallback !== null) {
			unstable_cancelCallback(existingCallback)
		}
		root.callbackNode = null
		root.callbackPriority = NoLane
		return
	}

	const curPriority = updateLane
	const prevPriority = root.callbackPriority

	if (curPriority === prevPriority) {
		return
	}

	if (existingCallback !== null) {
		unstable_cancelCallback(existingCallback)
	}
	let newCallbackNode = null
	if (__DEV__) {
		console.log(
			`在${updateLane === SyncLane ? '微任务' : '宏任务'}中调度 优先级`,
			updateLane
		)
	}
	if (updateLane === SyncLane) {
		//同步优先级，用微任务调度

		scheduleSyncCallback(performSyncWorkOnRoot.bind(null, root, updateLane))
		scheduleMicroTask(flushSyncCallbacks)
	} else {
		//其他优先级 用宏任务调度
		const schedulerPriority = lanesToSchedulerPriority(updateLane)
		newCallbackNode = scheduleCallback(
			schedulerPriority,
			performConcurrentWorkOnRoot.bind(null, root)
		)
	}
	root.callbackNode = newCallbackNode
	root.callbackPriority = curPriority
}

export function markRootUpdated(root: FiberRootNode, lane: Lane) {
	root.pendinglanes = mergeLanes(root.pendinglanes, lane)
}

function markUpdateLaneFromFiberRoRoot(fiber: FiberNode, lane: Lane) {
	let node = fiber
	let parent = node.return
	while (parent !== null) {
		parent.childLanes = mergeLanes(parent.childLanes, lane)
		const alternate = parent.alternate
		if (alternate !== null) {
			alternate.childLanes = mergeLanes(alternate.childLanes, lane)
		}
		node = parent
		parent = node.return
	}
	if (node.tag === HostRoot) {
		return node.stateNode
	}
	return null
}

function performConcurrentWorkOnRoot(
	root: FiberRootNode,
	didTimeOut: boolean
): any {
	//保证useEffect回调执行
	const curCallback = root.callbackNode
	const didFlushPassiveEffect = flushPassiveEffect(root.pendingPassiveEffects)
	if (didFlushPassiveEffect) {
		if (root.callbackNode !== curCallback) {
			return null
		}
	}
	const lane = getNextLane(root)
	const curCallbackNode = root.callbackNode
	if (lane === NoLane) {
		return null
	}

	const needSync = lane === SyncLane || didTimeOut
	const exitStatus = renderRoot(root, lane, !needSync)

	switch (exitStatus) {
		case RootInComplete:
			if (root.callbackNode !== curCallbackNode) {
				return null
			}
			return performConcurrentWorkOnRoot.bind(null, root)
		case RootCompleted:
			const finishedWork = root.current.alternate
			root.finishedWork = finishedWork
			root.finishedlane = lane
			wipRootRenderLane = NoLane
			//wip fiberNode树的中flags
			commitRoot(root)
			break
		case RootDidNotComplete:
			wipRootRenderLane = NoLane
			markRootSuspended(root, lane)
			ensureRootIsScheduled(root)
			break
		default:
			if (__DEV__) {
				console.error('还未实现并发更新结束状态')
			}
			break
	}
}

function performSyncWorkOnRoot(root: FiberRootNode) {
	const nextLane = getNextLane(root)
	if (nextLane !== SyncLane) {
		ensureRootIsScheduled(root)
		return
	}
	const exitStatus = renderRoot(root, nextLane, false)
	switch (exitStatus) {
		case RootCompleted:
			const finishedWork = root.current.alternate
			root.finishedWork = finishedWork
			root.finishedlane = nextLane
			wipRootRenderLane = NoLane
			//wip fiberNode树的中flags
			commitRoot(root)
			break
		case RootDidNotComplete:
			wipRootRenderLane = NoLane
			markRootSuspended(root, nextLane)
			ensureRootIsScheduled(root)
			break
		default:
			if (__DEV__) {
				console.error('还未实现同步更新结束状态')
				break
			}
	}
}

function renderRoot(root: FiberRootNode, lane: Lane, shouldTimeSlice: boolean) {
	if (__DEV__) {
		console.log(`开始${shouldTimeSlice ? '并发' : '同步'}更新`)
	}
	if (__DEV__) {
		console.warn('render阶段开始')
	}

	if (wipRootRenderLane !== lane) {
		prepareRefreshStack(root, lane)
	}

	do {
		try {
			if (wipSuspendedReason !== NotSuspended && workInProgress !== null) {
				const thrownValue = wipThrownValue
				wipSuspendedReason = NotSuspended
				wipThrownValue = null
				//unwind
				throwAndUnwindWorkLoop(root, workInProgress, thrownValue, lane)
			}
			shouldTimeSlice ? workLoopConcurrent() : workLoopSync()
			break
		} catch (e) {
			if (__DEV__) {
				console.warn('workLoop发生错误', e)
			}

			//TODO
			handleThrow(root, e)
		}
	} while (true)

	if (wipRootExitStatus !== RootInProcess) {
		return wipRootExitStatus
	}

	if (shouldTimeSlice && workInProgress !== null) {
		return RootInComplete
	}
	if (!shouldTimeSlice && workInProgress !== null && __DEV__) {
		console.error('render阶段结束wip不应该是null')
	}
	return RootCompleted
}

function handleThrow(root: FiberRootNode, thrownValue: any) {
	if (thrownValue === SuspenseException) {
		thrownValue = getSuspensewThenable()
		wipSuspendedReason = SupendedOnData
	}
	wipThrownValue = thrownValue
}

function throwAndUnwindWorkLoop(
	root: FiberRootNode,
	unitOfWork: FiberNode,
	thrownValue: any,
	lane: Lane
) {
	//重置 FC 全局变量
	resetHooksOnUnwind()

	//请求返回后重新触发更新
	throwException(root, thrownValue, lane)

	//unwind
	unwindUnitOfWork(unitOfWork)
}

function unwindUnitOfWork(unitOfWork: FiberNode) {
	let incompleteWork: FiberNode | null = unitOfWork
	do {
		const next = unWindWork(incompleteWork)
		if (next !== null) {
			workInProgress = next
			return
		}
		const returnFiber = incompleteWork.return as FiberNode
		if (returnFiber !== null) {
			returnFiber.deletions = null
		}
		incompleteWork = returnFiber
	} while (incompleteWork !== null)
	//使用了use 抛出了data,但是没有定义suspense
	wipRootExitStatus = RootCompleted
	workInProgress = null
}

function flushPassiveEffect(pendingPassiveEffects: PendingPassiveEffects) {
	let didFlushPassiveEffect = false
	pendingPassiveEffects.unmount.forEach((effect) => {
		didFlushPassiveEffect = true
		commitHookEffectListUnmount(Passive, effect)
	})
	pendingPassiveEffects.unmount = []
	pendingPassiveEffects.update.forEach((effect) => {
		didFlushPassiveEffect = true
		commitHookEffectListDestory(Passive | HookHasEffect, effect)
	})
	pendingPassiveEffects.update.forEach((effect) => {
		didFlushPassiveEffect = true
		commitHookEffectListCreate(Passive | HookHasEffect, effect)
	})
	pendingPassiveEffects.update = []
	flushSyncCallbacks()
	return didFlushPassiveEffect
}

function commitRoot(root: FiberRootNode) {
	const finishedWork = root.finishedWork
	if (finishedWork === null) {
		return
	}

	if (__DEV__) {
		console.warn('commit阶段开始', finishedWork)
	}
	const lane = root.finishedlane

	if (lane === NoLane && __DEV__) {
		console.error('commit阶段finishedLane不应该是NoLane')
	}

	root.finishedWork = null
	root.finishedlane = NoLane
	markRootFinished(root, lane)

	if (
		(finishedWork.flags & PassiveMask) !== NoFlags ||
		(finishedWork.subtreeFlags & PassiveMask) !== NoFlags
	) {
		if (!rootDoesHasPassiveEffects) {
			rootDoesHasPassiveEffects = true
			//调度副作用
			scheduleCallback(NormalPriority, () => {
				//执行副作用
				flushPassiveEffect(root.pendingPassiveEffects)
				return
			})
		}
	}

	const subtreeHasEffect =
		(finishedWork.subtreeFlags & MutationMask) !== NoFlags
	const rootHasEffect = (finishedWork.flags & MutationMask) !== NoFlags

	if (subtreeHasEffect || rootHasEffect) {
		//beforeMutation
		//mutation
		commitMutaionEffects(finishedWork, root)
		root.current = finishedWork
		//layout
		commitLayoutEffects(finishedWork, root)
	} else {
		root.current = finishedWork
	}
	rootDoesHasPassiveEffects = false
	ensureRootIsScheduled(root)
}

function workLoopSync() {
	while (workInProgress !== null) {
		performUnitOfWork(workInProgress)
	}
}

function workLoopConcurrent() {
	while (workInProgress !== null && !unstable_shouldYield()) {
		performUnitOfWork(workInProgress)
	}
}

function performUnitOfWork(fiber: FiberNode) {
	const next = beginWork(fiber, wipRootRenderLane)
	fiber.memoizedProps = fiber.pendingProps
	if (next === null) {
		complateUnitOfWork(fiber)
	} else {
		workInProgress = next
	}
}

function complateUnitOfWork(fiber: FiberNode) {
	let node: FiberNode | null = fiber
	do {
		completeWork(node)
		const sibling = node.sibling
		if (sibling !== null) {
			workInProgress = sibling
			return
		}
		node = node.return
		workInProgress = node
	} while (node !== null)
}
