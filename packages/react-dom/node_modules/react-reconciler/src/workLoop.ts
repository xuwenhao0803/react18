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
	markRootFinished,
	mergeLanes
} from './fiberLanes'
import { flushSyncCallbacks, scheduleSyncCallback } from './syncTaskQueue'
import { HostRoot } from './workTags'
import {
	unstable_scheduleCallback as scheduleCallback,
	unstable_NormalPriority as NormalPriority
} from 'scheduler'
import { HookHasEffect, Passive } from './hookEffectTags'

let workInProgress: FiberNode | null = null
let wipRootRenderLane: Lane = NoLane
let rootDoesHasPassiveEffects: boolean = false

function prepareRefreshStack(root: FiberRootNode, lane: Lane) {
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
	if (updateLane === NoLane) {
		return
	}
	if (updateLane === SyncLane) {
		//同步优先级，用微任务调度
		if (__DEV__) {
			console.log('在微任务中调度 优先级', updateLane)
		}
		scheduleSyncCallback(performSyncWorkOnRoot.bind(null, root, updateLane))
		scheduleMicroTask(flushSyncCallbacks)
	} else {
		//其他优先级 用宏任务调度
	}
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

function performSyncWorkOnRoot(root: FiberRootNode, lane: Lane) {
	const nextLane = getHighestPriorityLane(root.pendinglanes)
	if (nextLane !== SyncLane) {
		ensureRootIsScheduled(root)
		return
	}

	if (__DEV__) {
		console.warn('render阶段开始')
	}

	prepareRefreshStack(root, lane)
	do {
		try {
			workLoop()
			break
		} catch (e) {
			if (__DEV__) {
				console.warn('workLoop发生错误', e)
			}

			workInProgress = null
		}
	} while (true)
	const finishedWork = root.current.alternate
	root.finishedWork = finishedWork
	root.finishedlane = lane
	wipRootRenderLane = NoLane
	//wip fiberNode树的中flags
	commitRoot(root)
}

function flushPassiveEffect(pendingPassiveEffects: PendingPassiveEffects) {
	pendingPassiveEffects.unmount.forEach((effect) => {
		commitHookEffectListUnmount(Passive, effect)
	})
	pendingPassiveEffects.unmount = []
	pendingPassiveEffects.update.forEach((effect) => {
		commitHookEffectListDestory(Passive | HookHasEffect, effect)
	})
	pendingPassiveEffects.update.forEach((effect) => {
		commitHookEffectListCreate(Passive | HookHasEffect, effect)
	})
	pendingPassiveEffects.update = []
	flushSyncCallbacks()
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

function workLoop() {
	while (workInProgress !== null) {
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
