import { ReactElementType } from 'shared/ReactTypes'
import {
	FiberNode,
	OffscreenProps,
	createFiberFromFragment,
	createFiberFromOffscreen,
	createWorkInProgress
} from './fiber'
import { UpdateQueue, processUpdateQueue } from './updateQueue'
import {
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText,
	Fragment,
	ContextProvider,
	SuspenseComponent,
	OffscreenComponent
} from './workTags'
import { mountChildFibers, reconcileChildFibers } from './childFibers'
import { renderWithHooks } from './fiberHooks'
import { Lane } from './fiberLanes'
import {
	ChildDeletion,
	DidCapture,
	NoFlags,
	Placement,
	Ref
} from './fiberFlags'
import { pushProvider } from './fiberContext'
import { pushSuspenseHandler } from './suspenseContext'

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
		case ContextProvider:
			return updateContextProvider(wip)
		case SuspenseComponent:
			return updateSuspenseComponent(wip)

		case OffscreenComponent:
			return updateOffscreenComponent(wip)

		default:
			if (__DEV__) {
				console.warn('beginWork未实现的类型')
			}
			break
	}
	return null
}

function updateSuspenseComponent(wip: FiberNode) {
	const current = wip.alternate
	const nextProps = wip.pendingProps
	let showFallback = false
	const didSuspend = (wip.flags & DidCapture) !== NoFlags
	if (didSuspend) {
		showFallback = true
		wip.flags &= ~DidCapture
	}
	const nextPrimartChildren = nextProps.children
	const nextFallbackChildren = nextProps.fallback
	pushSuspenseHandler(wip)
	if (current === null) {
		//mount
		if (showFallback) {
			//挂起
			return mountSuspenseFallbackChildren(
				wip,
				nextPrimartChildren,
				nextFallbackChildren
			)
		} else {
			//正常
			return mountSuspensePrimaryChildren(wip, nextPrimartChildren)
		}
	} else {
		//update
		if (showFallback) {
			//挂起
			return updateSuspenseFallbackChildren(
				wip,
				nextPrimartChildren,
				nextFallbackChildren
			)
		} else {
			//正常
			return updateSuspensePrimaryChildren(
				wip,
				nextPrimartChildren,
				nextFallbackChildren
			)
		}
	}
}

function updateSuspensePrimaryChildren(
	wip: FiberNode,
	primaryChildren: any,
	fallbackChildren: any
) {
	const current = wip.alternate as FiberNode
	const currentPrimaryChildFragment = current.child as FiberNode
	const currentFallbackChildFragment: FiberNode | null =
		currentPrimaryChildFragment.sibling
	const primaryChildrenProps: OffscreenProps = {
		mode: 'visible',
		children: primaryChildren
	}
	const primaryChildFragment = createWorkInProgress(
		currentPrimaryChildFragment,
		primaryChildrenProps
	)
	primaryChildFragment.return = wip
	primaryChildFragment.sibling = null
	wip.child = primaryChildFragment
	if (currentFallbackChildFragment !== null) {
		const deletions = wip.deletions
		if (deletions === null) {
			wip.deletions = [currentFallbackChildFragment]
			wip.flags |= ChildDeletion
		} else {
			deletions.push(currentFallbackChildFragment)
		}
	}
	return primaryChildFragment
}

function updateSuspenseFallbackChildren(
	wip: FiberNode,
	primaryChildren: any,
	fallbackChildren: any
) {
	const current = wip.alternate as FiberNode
	const currentPrimaryChildFragment = current.child as FiberNode
	const currentFallbackChildFragment: FiberNode | null =
		currentPrimaryChildFragment.sibling

	const primaryChildrenProps: OffscreenProps = {
		mode: 'hidden',
		children: primaryChildren
	}
	const primaryChildFragment = createWorkInProgress(
		currentPrimaryChildFragment,
		primaryChildrenProps
	)
	let fallbackChildFragment
	if (currentFallbackChildFragment !== null) {
		fallbackChildFragment = createWorkInProgress(
			currentFallbackChildFragment,
			fallbackChildren
		)
	} else {
		fallbackChildFragment = createFiberFromFragment(fallbackChildren, null)
		fallbackChildFragment.flags |= Placement
	}
	fallbackChildFragment.return = wip
	primaryChildFragment.return = wip
	primaryChildFragment.sibling = fallbackChildFragment
	wip.child = primaryChildFragment
	return fallbackChildFragment
}

function mountSuspensePrimaryChildren(wip: FiberNode, primaryChildren: any) {
	const primaryChildrenProps: OffscreenProps = {
		mode: 'visible',
		children: primaryChildren
	}
	const primaryChildFragment = createFiberFromOffscreen(primaryChildrenProps)
	wip.child = primaryChildFragment
	primaryChildFragment.return = wip
	return primaryChildFragment
}

function mountSuspenseFallbackChildren(
	wip: FiberNode,
	primaryChildren: any,
	fallbackChildren: any
) {
	const primaryChildrenProps: OffscreenProps = {
		mode: 'hidden',
		children: primaryChildren
	}
	const primaryChildFragment = createFiberFromOffscreen(primaryChildrenProps)
	const fallbackChildFragment = createFiberFromFragment(fallbackChildren, null)
	fallbackChildFragment.flags |= Placement
	primaryChildFragment.return = wip
	fallbackChildFragment.return = wip
	primaryChildFragment.sibling = fallbackChildFragment
	wip.child = primaryChildFragment
	return fallbackChildFragment
}

function updateOffscreenComponent(wip: FiberNode) {
	const nextProps = wip.pendingProps
	const nextChildren = nextProps.children
	reconcileChildren(wip, nextChildren)
	return wip.child
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

function updateContextProvider(wip: FiberNode) {
	const providerType = wip.type
	const context = providerType._context
	const newProps = wip.pendingProps
	pushProvider(context, newProps.value)
	const nextChildren = newProps.children
	reconcileChildren(wip, nextChildren)
	return wip.child
}

function updateHostRoot(wip: FiberNode, renderLane: Lane) {
	const baseState = wip.memoizedState
	const updateQueue = wip.updateQueue as UpdateQueue<Element>
	const pending = updateQueue.shared.pending
	updateQueue.shared.pending = null
	const { memeizedState } = processUpdateQueue(baseState, pending, renderLane)
	const current = wip.alternate
	if (current !== null) {
		current.memoizedState = memeizedState
	}
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
