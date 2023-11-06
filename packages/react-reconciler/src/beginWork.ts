import { ReactElementType } from 'shared/ReactTypes'
import { FiberNode } from './fiber'
import { UpdateQueue, processUpdateQueue } from './updateQueue'
import {
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText
} from './workTags'
import { mountChildFibers, reconcileChildFibers } from './childFibers'
import { renderWithHooks } from './fiberHooks'

//递归中的递阶段
export const beginWork = (wip: FiberNode) => {
	switch (wip.tag) {
		case HostRoot:
			return updateHostRoot(wip)

		case HostComponent:
			return updateHostComponent(wip)

		case HostText:
			return null
		case FunctionComponent:
			return updateFunctionConponent(wip)
		default:
			if (__DEV__) {
				console.warn('beginWork未实现的类型')
			}
			break
	}
	return null
}

function updateFunctionConponent(wip: FiberNode) {
	const nextChildren = renderWithHooks(wip)
	reconcileChildren(wip, nextChildren)
	return wip.child
}

function updateHostRoot(wip: FiberNode) {
	const baseState = wip.mermoizedState
	const updateQueue = wip.updateQueue as UpdateQueue<Element>
	const pending = updateQueue.shared.pending
	updateQueue.shared.pending = null
	const { memeizedState } = processUpdateQueue(baseState, pending)
	wip.mermoizedState = memeizedState
	const nextChildren = wip.mermoizedState
	reconcileChildren(wip, nextChildren)
	return wip.child
}

function updateHostComponent(wip: FiberNode) {
	const nextProps = wip.pendingProps
	const nextChildren = nextProps.children
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
