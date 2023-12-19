import { FiberRootNode } from './fiber'

export type Lane = number
export type Lanes = number

export const SyncLane = 0b0001
export const NoLane = 0b000
export const NoLanes = 0b000

export function mergeLanes(laneA: Lane, lanB: Lane): Lanes {
	return laneA | lanB
}

export function requestUpdateLane() {
	return SyncLane
}

export function getHighestPriorityLane(lanes: Lanes): Lane {
	return lanes & -lanes
}

export function markRootFinished(root: FiberRootNode, lane: Lane) {
	root.pendinglanes &= ~lane
}
