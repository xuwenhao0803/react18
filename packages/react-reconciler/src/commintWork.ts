import {
	Container,
	Instance,
	appendChildToContainer,
	commitUpdate,
	insertChildToContainer,
	removeChild
} from 'hostConfig'
import { FiberNode, FiberRootNode, PendingPassiveEffects } from './fiber'
import {
	ChildDeletion,
	Flags,
	LayoutMask,
	MutationMask,
	NoFlags,
	PassiveEffect,
	PassiveMask,
	Placement,
	Ref,
	Update
} from './fiberFlags'
import {
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText
} from './workTags'
import { Effect, FCUpdateQueue } from './fiberHooks'
import { HookHasEffect } from './hookEffectTags'

let nextEffect: FiberNode | null = null
export const commitEffects = (
	phrase: 'mutation' | 'layout',
	mask: Flags,
	callback: (fiber: FiberNode, root: FiberRootNode) => void
) => {
	return (finishedWork: FiberNode, root: FiberRootNode) => {
		nextEffect = finishedWork
		while (nextEffect !== null) {
			const child: FiberNode | null = nextEffect.child
			if ((nextEffect.subtreeFlags & mask) !== NoFlags && child !== null) {
				nextEffect = child
			} else {
				// 向上遍历
				up: while (nextEffect !== null) {
					callback(nextEffect, root)
					const sibling: FiberNode | null = nextEffect.sibling
					if (sibling !== null) {
						nextEffect = sibling
						break up
					}
					nextEffect = nextEffect.return
				}
			}
		}
	}
}

const commitLayoutEffectsOnFiber = (
	finishedWork: FiberNode,
	root: FiberRootNode
) => {
	const { flags, tag } = finishedWork
	if ((flags & Ref) !== NoFlags && tag === HostComponent) {
		safelyAttachRef(finishedWork)
		finishedWork.flags &= ~Ref
	}
}

function safelyAttachRef(fiber: FiberNode) {
	const ref = fiber.ref
	if (ref !== null) {
		const instance = fiber.stateNode
		if (typeof ref === 'function') {
			ref(instance)
		} else {
			ref.current = instance
		}
	}
}

const commitMutationEffectsOnFiber = (
	finishedWork: FiberNode,
	root: FiberRootNode
) => {
	const { flags, tag } = finishedWork
	if ((flags & Placement) !== NoFlags) {
		commitPlaceMent(finishedWork)
		finishedWork.flags &= ~Placement
	}

	if ((flags & Update) !== NoFlags) {
		commitUpdate(finishedWork)
		finishedWork.flags &= ~Update
	}

	if ((flags & ChildDeletion) !== NoFlags) {
		const deletions = finishedWork.deletions
		if (deletions !== null) {
			deletions.forEach((childToDelete) => {
				commitDeletion(childToDelete, root)
			})
		}
		finishedWork.flags &= ~ChildDeletion
	}
	if ((flags & PassiveEffect) !== NoFlags) {
		//收集回调
		commitPassiveEffect(finishedWork, root, 'update')
		finishedWork.flags &= ~PassiveEffect
	}

	if ((flags & Ref) !== NoFlags && tag === HostComponent) {
		safeDetachRef(finishedWork)
	}
}

function safeDetachRef(current: FiberNode) {
	const ref = current.ref
	if (ref !== null) {
		if (typeof ref === 'function') {
			ref(null)
		} else {
			ref.current = null
		}
	}
}

export const commitMutaionEffects = commitEffects(
	'mutation',
	MutationMask | PassiveMask,
	commitMutationEffectsOnFiber
)

export const commitLayoutEffects = commitEffects(
	'layout',
	LayoutMask,
	commitLayoutEffectsOnFiber
)
function commitPassiveEffect(
	fiber: FiberNode,
	root: FiberRootNode,
	type: keyof PendingPassiveEffects
) {
	if (
		fiber.tag !== FunctionComponent ||
		(type === 'update' && (fiber.flags & PassiveEffect) === NoFlags)
	) {
		return
	}
	const updateQueue = fiber.updateQueue as FCUpdateQueue<any>
	if (updateQueue !== null) {
		if (updateQueue.lastEffect === null && __DEV__) {
			console.warn('当FC存在PassiveEffect flags时 不应该不存在effect ')
		}
		root.pendingPassiveEffects[type].push(updateQueue.lastEffect)
	}
}
function commitHookEffectList(
	flags: Flags,
	lastEffect: Effect,
	callback: (effect: Effect) => void
) {
	let effect = lastEffect.next
	do {
		if ((effect.tag & flags) === flags) {
			callback(effect)
		}
		effect = effect.next
	} while (effect !== lastEffect.next)
}

export function commitHookEffectListUnmount(flags: Flags, lastEffect: Effect) {
	commitHookEffectList(flags, lastEffect, (effect) => {
		const destory = effect.destroy
		if (typeof destory === 'function') {
			destory()
		}
		effect.tag &= ~HookHasEffect
	})
}

export function commitHookEffectListDestory(flags: Flags, lastEffect: Effect) {
	commitHookEffectList(flags, lastEffect, (effect) => {
		const destory = effect.destroy
		if (typeof destory === 'function') {
			destory()
		}
	})
}

export function commitHookEffectListCreate(flags: Flags, lastEffect: Effect) {
	commitHookEffectList(flags, lastEffect, (effect) => {
		const create = effect.create
		if (typeof create === 'function') {
			effect.destroy = create()
		}
	})
}

function recordHostChildrenToDelete(
	childrenToDelete: FiberNode[],
	unmountFiber: FiberNode
) {
	const lastOne = childrenToDelete[childrenToDelete.length - 1]
	if (!lastOne) {
		childrenToDelete.push(unmountFiber)
	} else {
		let node = lastOne.sibling
		while (node !== null) {
			if (unmountFiber === node) {
				childrenToDelete.push(unmountFiber)
			}
			node = node.sibling
		}
	}
}

function commitDeletion(childToDelete: FiberNode, root: FiberRootNode) {
	const rootChildrenToDelete: FiberNode[] = []
	commitNestedComponent(childToDelete, (unmountFiber) => {
		switch (unmountFiber.tag) {
			case HostComponent:
				recordHostChildrenToDelete(rootChildrenToDelete, unmountFiber)
				safeDetachRef(unmountFiber)
				return
			case HostText:
				recordHostChildrenToDelete(rootChildrenToDelete, unmountFiber)
				return

			case FunctionComponent:
				//TODO useEffect unmount
				commitPassiveEffect(unmountFiber, root, 'unmount')
				break

			default:
				console.warn('未处理的unmount类型', unmountFiber)
				break
		}
	})
	if (rootChildrenToDelete) {
		const hostParent = getHostParent(childToDelete)
		if (hostParent !== null) {
			rootChildrenToDelete.forEach((node) => {
				removeChild(node.stateNode, hostParent)
			})
		}
	}
	childToDelete.return = null
	childToDelete.child = null
}

function commitNestedComponent(
	root: FiberNode,
	onCommitUnmount: (fiber: FiberNode) => void
) {
	let node = root
	while (true) {
		onCommitUnmount(node)
		if (node.child !== null) {
			node.child.return = node
			node = node.child
			continue
		}
		if (node === root) {
			return
		}
		while (node.sibling === null) {
			if (node.return === null || node.return === root) {
				return
			}
			node = node.return
		}
		node.sibling.return = node.return
		node = node.sibling
	}
}

const commitPlaceMent = (finishedWork: FiberNode) => {
	//parent DOM
	//finishedWork
	if (__DEV__) {
		console.warn('执行placement操作', finishedWork)
	}
	//parent DOM
	const hostParent = getHostParent(finishedWork)

	const sibling = getHostSibling(finishedWork)

	if (hostParent !== null) {
		insertOrAppendPlacementNodeIntoContainer(finishedWork, hostParent, sibling)
	}
}

function getHostSibling(fiber: FiberNode) {
	let node: FiberNode = fiber
	findSibling: while (true) {
		while (node.sibling === null) {
			const parent = node.return || null
			if (
				parent === null ||
				parent.tag === HostComponent ||
				parent.tag === HostRoot
			) {
				return null
			}
			node = parent
		}
		node.sibling.return = node.return
		node = node.sibling
		while (node.tag !== HostText && node.tag !== HostComponent) {
			if ((node.flags & Placement) !== NoFlags) {
				continue findSibling
			}
			if (node.child === null) {
				continue findSibling
			} else {
				node.child.return = node
				node = node.child
			}
		}
		if ((node.flags & Placement) === NoFlags) {
			return node.stateNode
		}
	}
}

function getHostParent(fiber: FiberNode): Container | null {
	let parent = fiber.return
	while (parent) {
		const parentTag = parent.tag
		if (parentTag === HostComponent) {
			return parent.stateNode as Container
		}
		if (parentTag === HostRoot) {
			return (parent.stateNode as FiberRootNode).container as Container
		}
		parent = parent.return
	}
	if (__DEV__) {
		console.warn('未找到host parent')
	}
	return null
}

function insertOrAppendPlacementNodeIntoContainer(
	finishedWork: FiberNode,
	hostParent: Container,
	before?: Instance
) {
	if (finishedWork.tag === HostComponent || finishedWork.tag === HostText) {
		if (before) {
			insertChildToContainer(finishedWork.stateNode, hostParent, before)
		} else {
			appendChildToContainer(hostParent, finishedWork.stateNode)
		}

		return
	}
	const child = finishedWork.child
	if (child !== null) {
		insertOrAppendPlacementNodeIntoContainer(child, hostParent)
		let sibling = child.sibling
		while (sibling !== null) {
			insertOrAppendPlacementNodeIntoContainer(sibling, hostParent)
			sibling = sibling.sibling
		}
	}
}
