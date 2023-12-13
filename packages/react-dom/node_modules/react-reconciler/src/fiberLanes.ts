export type Lane = number
export type Lanes = number

export const SyncLane = 0b0001
export const NoLane = 0b000

export function mergeLanes(laneA: Lane, lanB: Lane): Lanes {
	return laneA | lanB
}

export function requestUpdateLane() {
	return SyncLane
}
