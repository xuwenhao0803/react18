import {
	unstable_IdlePriority,
	unstable_ImmediatePriority,
	unstable_NormalPriority,
	unstable_UserBlockingPriority,
	unstable_getCurrentPriorityLevel
} from 'scheduler'
import { FiberRootNode } from './fiber'
import ReactCurrentBatchConfig from 'react/src/currentBatchConfig'

export type Lane = number
export type Lanes = number

export const SyncLane = 0b00001
export const NoLane = 0b00000
export const NoLanes = 0b00000
export const InputContinuousLane = 0b00010
export const DefaultLane = 0b00100
export const TransitionLane = 0b01000
export const IdleLane = 0b10000

export function mergeLanes(laneA: Lane, lanB: Lane): Lanes {
	return laneA | lanB
}

export function requestUpdateLane() {
	const isTransition = ReactCurrentBatchConfig.transition
	if (isTransition) {
		return TransitionLane
	}

	//从当前上下文获取Scheduler的优先级
	const currentSchedulerPriority = unstable_getCurrentPriorityLevel()
	const lane = schedulerPriorityToLane(currentSchedulerPriority)
	return lane
}

export function getHighestPriorityLane(lanes: Lanes): Lane {
	return lanes & -lanes
}

export function isSubsetOfLanes(set: Lanes, subset: Lane) {
	return (set & subset) === subset
}

export function markRootFinished(root: FiberRootNode, lane: Lane) {
	root.pendinglanes &= ~lane
}

export function lanesToSchedulerPriority(lanes: Lanes) {
	const lane = getHighestPriorityLane(lanes)
	if (lane === SyncLane) {
		return unstable_ImmediatePriority
	}
	if (lane === InputContinuousLane) {
		return unstable_UserBlockingPriority
	}
	if (lane === DefaultLane) {
		return unstable_NormalPriority
	}
	return unstable_IdlePriority
}

function schedulerPriorityToLane(schedulerPriority: number) {
	if (schedulerPriority === unstable_ImmediatePriority) {
		return SyncLane
	}
	if (schedulerPriority === unstable_UserBlockingPriority) {
		return InputContinuousLane
	}
	if (schedulerPriority === unstable_NormalPriority) {
		return DefaultLane
	}
	return NoLane
}

export function markRootSuspended(root: FiberRootNode, suspendedLane: Lane) {
	root.suspendedLanes |= suspendedLane
	root.pendinglanes &= ~suspendedLane
}

export function markRootPinged(root: FiberRootNode, pingLane: Lane) {
	root.pingLanes |= root.suspendedLanes & pingLane
}

export function getNextLane(root: FiberRootNode): Lane {
	const pendingLanes = root.pendinglanes
	if (pendingLanes === NoLanes) {
		return NoLane
	}
	let nextLane = NoLane
	const suspendedLanes = pendingLanes & ~root.suspendedLanes
	if (suspendedLanes !== NoLanes) {
		nextLane = getHighestPriorityLane(suspendedLanes)
	} else {
		const pingLanes = pendingLanes & root.pingLanes
		if (pendingLanes !== NoLanes) {
			nextLane = getHighestPriorityLane(pingLanes)
		}
	}
	return nextLane
}

export function includeSomeLanes(set: Lanes, subset: Lane | Lanes): boolean {
	return (set & subset) !== NoLanes
}

export function removeLanes(set: Lanes, subset: Lanes | Lane): Lanes {
	return set & ~subset
}
