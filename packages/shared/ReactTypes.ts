export type Type = any
export type Key = any
export type Ref = { current: any } | ((instance: any) => void)
export type Props = any
export type ElementType = any

export interface ReactElementType {
	$$typeof: symbol | number
	type: ElementType
	key: Key
	props: Props
	ref: Ref
	__mark: string
}

export type Action<State> = State | ((prevState: State) => State)

export type ReactContext<T> = {
	$$typeof: symbol | number
	Provider: ReactPropTypes<T> | null
	_currentValue: T
}

export type ReactPropTypes<T> = {
	$$typeof: symbol | number
	_context: ReactContext<T> | null
}
