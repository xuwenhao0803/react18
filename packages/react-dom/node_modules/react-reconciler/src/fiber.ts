import { Props, Key, Ref, ReactElementType, Weakable } from 'shared/ReactTypes'
import {
	ContextProvider,
	Fragment,
	FunctionComponent,
	HostComponent,
	MemoComponent,
	OffscreenComponent,
	SuspenseComponent,
	WorkTag
} from './workTags'
import { NoFlags, Flags } from './fiberFlags'
import { Container } from 'hostConfig'
import { Lane, Lanes, NoLane, NoLanes } from './fiberLanes'
import { Effect } from './fiberHooks'
import { CallbackNode } from 'scheduler'
import {
	REACT_MEMO_TYPE,
	REACT_PROVIDER_TYPE,
	REACT_SUPENSE_TYPE
} from 'shared/ReactSymbols'

export interface OffscreenProps {
	mode: 'visible' | 'hidden'
	children: any
}

export class FiberNode {
	type: any
	tag: WorkTag
	pendingProps: Props
	key: Key
	stateNode: any
	return: FiberNode | null
	sibling: FiberNode | null
	child: FiberNode | null
	index: number
	ref: Ref
	alternate: FiberNode | null
	memoizedState: Props | null
	memoizedProps: Props | null
	flags: Flags
	subtreeFlags: Flags
	updateQueue: unknown
	deletions: FiberNode[] | null
	lanes: Lanes
	childLanes: Lane
	constructor(tag: WorkTag, pendingProps: Props, key: Key) {
		this.tag = tag
		this.key = key || null
		this.stateNode = null
		this.type = null

		//构成树状结构
		this.return = null
		this.sibling = null
		this.child = null
		this.index = 0
		this.ref = null
		//做为工作单元
		this.pendingProps = pendingProps
		this.memoizedState = null
		this.memoizedProps = null
		this.updateQueue = null
		this.alternate = null
		//副作用
		this.flags = NoFlags
		this.subtreeFlags = NoFlags
		this.deletions = null
		this.lanes = NoLanes
		this.childLanes = NoLanes
	}
}

export interface PendingPassiveEffects {
	unmount: Effect[]
	update: Effect[]
}
export class FiberRootNode {
	container: Container
	current: FiberNode
	finishedWork: FiberNode | null
	pendinglanes: Lanes
	finishedlane: Lane
	pendingPassiveEffects: PendingPassiveEffects

	callbackNode: CallbackNode | null
	callbackPriority: Lane

	pingCache: WeakMap<Weakable<any>, Set<Lane>> | null

	suspendedLanes: Lanes
	pingLanes: Lanes

	constructor(container: Container, hostRootFiber: FiberNode) {
		this.container = container
		this.current = hostRootFiber
		hostRootFiber.stateNode = this
		this.finishedWork = null
		this.pendinglanes = NoLanes
		this.suspendedLanes = NoLanes
		this.pingLanes = NoLanes

		this.finishedlane = NoLane

		this.callbackNode = null
		this.callbackPriority = NoLane
		this.pendingPassiveEffects = {
			unmount: [],
			update: []
		}
		this.pingCache = null
	}
}

export const createWorkInProgress = (
	current: FiberNode,
	pendingProps: Props
): FiberNode => {
	let wip = current.alternate
	if (wip === null) {
		//mount
		wip = new FiberNode(current.tag, pendingProps, current.key)

		wip.stateNode = current.stateNode
		wip.alternate = current
		current.alternate = wip
	} else {
		wip.pendingProps = pendingProps
		wip.flags = NoFlags
		wip.subtreeFlags = NoFlags
		wip.deletions = null
	}
	wip.type = current.type
	wip.updateQueue = current.updateQueue
	wip.child = current.child
	wip.memoizedProps = current.memoizedProps
	wip.memoizedState = current.memoizedState
	wip.ref = current.ref

	wip.lanes = current.lanes
	wip.childLanes = current.childLanes

	return wip
}

export function createFiberFromElement(element: ReactElementType): FiberNode {
	const { type, key, props, ref } = element

	let fiberTag: WorkTag = FunctionComponent
	if (typeof type === 'string') {
		fiberTag = HostComponent
	} else if (typeof type === 'object') {
		switch (type.$$typeof) {
			case REACT_PROVIDER_TYPE:
				fiberTag = ContextProvider
				break
			case REACT_MEMO_TYPE:
				fiberTag = MemoComponent
				break
			default:
				console.warn('未定义type类型')
				break
		}
	} else if (type === REACT_SUPENSE_TYPE) {
		fiberTag = SuspenseComponent
	} else if (typeof type !== 'function' && __DEV__) {
		console.warn('未定义的type类型', element)
	}
	const fiber = new FiberNode(fiberTag, props, key)

	fiber.type = type
	fiber.ref = ref
	return fiber
}

export function createFiberFromFragment(elements: any[], key: Key): FiberNode {
	const fiber = new FiberNode(Fragment, elements, key)
	return fiber
}

export function createFiberFromOffscreen(
	pendingProps: OffscreenProps
): FiberNode {
	const fiber = new FiberNode(OffscreenComponent, pendingProps, null)
	return fiber
}
