import { Weakable } from 'shared/ReactTypes'
import { FiberRootNode } from './fiber'
import { Lane, markRootPinged } from './fiberLanes'
import { ensureRootIsScheduled, markRootUpdated } from './workLoop'
import { getSuspenseHandler } from './suspenseContext'
import { ShouldCapture } from './fiberFlags'

export function throwException(root: FiberRootNode, value: any, lane: any) {
	if (
		value !== null &&
		typeof value === 'object' &&
		typeof value.then === 'function'
	) {
		const wakeable: Weakable<any> = value
		const suspenseBoundary = getSuspenseHandler()
		if (suspenseBoundary) {
			suspenseBoundary.flags |= ShouldCapture
		}
		attachPingListener(root, wakeable, lane)
	}
}

function attachPingListener(
	root: FiberRootNode,
	wakeable: Weakable<any>,
	lane: Lane
) {
	let pingCache = root.pingCache
	let threadIDs: Set<Lane> | undefined

	if (pingCache === null) {
		threadIDs = new Set<Lane>()
		pingCache = root.pingCache = new WeakMap<Weakable<any>, Set<Lane>>()
		pingCache.set(wakeable, threadIDs)
	} else {
		threadIDs = pingCache.get(wakeable)
		if (threadIDs === undefined) {
			threadIDs = new Set<Lane>()
			pingCache.set(wakeable, threadIDs)
		}
	}
	if (!threadIDs.has(lane)) {
		threadIDs.add(lane)
		// eslint-disable-next-line no-inner-declarations
		function ping() {
			if (pingCache !== null) {
				pingCache.delete(wakeable)
			}
			markRootPinged(root, lane)
			markRootUpdated(root, lane)
			ensureRootIsScheduled(root)
		}
		wakeable.then(ping, ping)
	}
}
