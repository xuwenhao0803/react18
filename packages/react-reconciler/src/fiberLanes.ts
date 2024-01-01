import {
	unstable_IdlePriority,
	unstable_ImmediatePriority,
	unstable_NormalPriority,
	unstable_UserBlockingPriority,
	unstable_getCurrentPriorityLevel
} from 'scheduler'
import { FiberRootNode } from './fiber'

export type Lane = number
export type Lanes = number

export const SyncLane = 0b0001
export const NoLane = 0b000
export const NoLanes = 0b000
export const InputContinuousLane = 0b0010
export const DefaultLane = 0b0100
export const IdleLane = 0b1000

export function mergeLanes(laneA: Lane, lanB: Lane): Lanes {
	return laneA | lanB
}

export function requestUpdateLane() {
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
