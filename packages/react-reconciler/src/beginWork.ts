import { ReactElementType } from 'shared/ReactTypes'
import { FiberNode } from './fiber'
import { UpdateQueue, processUpdateQueue } from './updateQueue'
import {
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText,
	Fragment
} from './workTags'
import { mountChildFibers, reconcileChildFibers } from './childFibers'
import { renderWithHooks } from './fiberHooks'
import { Lane } from './fiberLanes'
import { Ref } from './fiberFlags'

//递归中的递阶段
export const beginWork = (wip: FiberNode, renderLane: Lane) => {
	switch (wip.tag) {
		case HostRoot:
			return updateHostRoot(wip, renderLane)

		case HostComponent:
			return updateHostComponent(wip)

		case HostText:
			return null
		case FunctionComponent:
			return updateFunctionConponent(wip, renderLane)
		case Fragment:
			return updateFragment(wip)
		default:
			if (__DEV__) {
				console.warn('beginWork未实现的类型')
			}
			break
	}
	return null
}

function updateFragment(wip: FiberNode) {
	const nextChildren = wip.pendingProps
	reconcileChildren(wip, nextChildren)
	return wip.child
}

function updateFunctionConponent(wip: FiberNode, renderLane: Lane) {
	const nextChildren = renderWithHooks(wip, renderLane)
	reconcileChildren(wip, nextChildren)
	return wip.child
}

function updateHostRoot(wip: FiberNode, renderLane: Lane) {
	const baseState = wip.memoizedState
	const updateQueue = wip.updateQueue as UpdateQueue<Element>
	const pending = updateQueue.shared.pending
	updateQueue.shared.pending = null
	const { memeizedState } = processUpdateQueue(baseState, pending, renderLane)
	wip.memoizedState = memeizedState
	const nextChildren = wip.memoizedState
	reconcileChildren(wip, nextChildren)
	return wip.child
}

function updateHostComponent(wip: FiberNode) {
	const nextProps = wip.pendingProps

	const nextChildren = nextProps.children
	markRef(wip.alternate, wip)
	reconcileChildren(wip, nextChildren)
	return wip.child
}

function reconcileChildren(wip: FiberNode, children?: ReactElementType) {
	const current = wip.alternate

	if (current !== null) {
		//update
		wip.child = reconcileChildFibers(wip, current?.child, children)
	} else {
		//mount
		wip.child = mountChildFibers(wip, null, children)
	}
}

function markRef(current: FiberNode | null, workInProgress: FiberNode) {
	const ref = workInProgress.ref
	if (
		(current === null && ref !== null) ||
		(current !== null && current.ref !== ref)
	) {
		workInProgress.flags |= Ref
	}
}
