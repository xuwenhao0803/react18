import { scheduleMicroTask } from 'hostConfig'
import { beginWork } from './beginWork'
import {
	commitHookEffectListCreate,
	commitHookEffectListDestory,
	commitHookEffectListUnmount,
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
	lanesToSchedulerPriority,
	markRootFinished,
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

let workInProgress: FiberNode | null = null
let wipRootRenderLane: Lane = NoLane
let rootDoesHasPassiveEffects: boolean = false

type RootExitStatus = number
const RootInComplete = 1
const RootCompleted = 2
//TODO执行过程报错了

function prepareRefreshStack(root: FiberRootNode, lane: Lane) {
	root.finishedlane = NoLane
	root.finishedWork = null
	workInProgress = createWorkInProgress(root.current, {})
	wipRootRenderLane = lane
}

export function scheduleUpdateOnFiber(fiber: FiberNode, lane: Lane) {
	const root = markUpdateFromFiberRoRoot(fiber)
	markRootUpdated(root, lane)
	ensureRootIsScheduled(root)
}

//调度阶段入口
function ensureRootIsScheduled(root: FiberRootNode) {
	const updateLane = getHighestPriorityLane(root.pendinglanes)
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

	if (updateLane === SyncLane) {
		//同步优先级，用微任务调度
		if (__DEV__) {
			console.log('在微任务中调度 优先级', updateLane)
		}
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

function markRootUpdated(root: FiberRootNode, lane: Lane) {
	root.pendinglanes = mergeLanes(root.pendinglanes, lane)
}

function markUpdateFromFiberRoRoot(fiber: FiberNode) {
	let node = fiber
	let parent = node.return
	while (parent !== null) {
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
	const lane = getHighestPriorityLane(root.pendinglanes)
	const curCallbackNode = root.callbackNode
	if (lane === NoLane) {
		return null
	}
	ensureRootIsScheduled(root)
	const needSync = lane === SyncLane || didTimeOut
	const exitStatus = renderRoot(root, lane, !needSync)
	if (exitStatus === RootInComplete) {
		if (root.callbackNode !== curCallbackNode) {
			return null
		}
		return performConcurrentWorkOnRoot.bind(null, root)
	}
	if (exitStatus === RootCompleted) {
		const finishedWork = root.current.alternate
		root.finishedWork = finishedWork
		root.finishedlane = lane
		wipRootRenderLane = NoLane
		//wip fiberNode树的中flags
		commitRoot(root)
	} else if (__DEV__) {
		console.error('还未实现并发更新结束状态')
	}
}

function performSyncWorkOnRoot(root: FiberRootNode) {
	const nextLane = getHighestPriorityLane(root.pendinglanes)
	if (nextLane !== SyncLane) {
		ensureRootIsScheduled(root)
		return
	}
	const exitStatus = renderRoot(root, nextLane, false)
	if (exitStatus === RootCompleted) {
		const finishedWork = root.current.alternate
		root.finishedWork = finishedWork
		root.finishedlane = nextLane
		wipRootRenderLane = NoLane
		//wip fiberNode树的中flags
		commitRoot(root)
	} else if (__DEV__) {
		console.error('还未实现同步更新结束状态')
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
			shouldTimeSlice ? workLoopConcurrent() : workLoopSync()
			break
		} catch (e) {
			if (__DEV__) {
				console.warn('workLoop发生错误', e)
			}

			workInProgress = null
		}
	} while (true)
	if (shouldTimeSlice && workInProgress !== null) {
		return RootInComplete
	}
	if (!shouldTimeSlice && workInProgress !== null && __DEV__) {
		console.error('render阶段结束wip不应该是null')
	}
	return RootCompleted
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
