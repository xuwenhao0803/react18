import { Container } from 'hostConfig'
import { Props } from 'shared/ReactTypes'

export const elementPropsKey = '__props'
const validEventTypeList = ['click']

type EventCallback = (e: Event) => void

interface SyntheicEvent extends Event {
	__stopPropagation: boolean
}

interface Paths {
	capture: EventCallback[]
	bubble: EventCallback[]
}

export interface DOMElement extends Element {
	[elementPropsKey]: Props
}

export function updateFiberProps(node: DOMElement, props: Props) {
	node[elementPropsKey] = props
}

export function initEvent(container: Container, eventType: string) {
	if (!validEventTypeList.includes(eventType)) {
		console.warn('当前不支持', eventType, '事件')
		return
	}
	if (__DEV__) {
		console.log('初始化事件', eventType)
	}
	container.addEventListener(eventType, (e) => {
		dispatchEvent(container, eventType, e)
	})
}
function createSyntheicEvent(e: Event) {
	const syntheicEvent = e as SyntheicEvent
	syntheicEvent.__stopPropagation = false
	const originStopPropagation = e.stopPropagation

	syntheicEvent.stopPropagation = () => {
		syntheicEvent.__stopPropagation = true
		if (originStopPropagation) {
			originStopPropagation()
		}
	}
	return syntheicEvent
}

function dispatchEvent(container: Container, eventType: string, e: Event) {
	const targetElement = e.target

	if (targetElement === null) {
		console.warn('事件不存在target', e)
		return
	}

	//收集沿途的事件
	const { bubble, capture } = collectPaths(
		targetElement as DOMElement,
		container,
		eventType
	)
	//构造合成事件
	const se = createSyntheicEvent(e)

	triggerEventFlow(capture, se)
	if (!se.__stopPropagation) {
		triggerEventFlow(bubble, se)
	}
}

function triggerEventFlow(paths: EventCallback[], se: SyntheicEvent) {
	for (let i = 0; i < paths.length; i++) {
		const callback = paths[i]
		callback.call(null, se)
		if (se.__stopPropagation) {
			break
		}
	}
}

function getEventCallbackNameFromEventType(
	eventType: string
): string[] | undefined {
	return {
		click: ['onClickCapture', 'onClick']
	}[eventType]
}

function collectPaths(
	targetElement: DOMElement,
	container: Container,
	eventType: string
) {
	const paths: Paths = {
		capture: [],
		bubble: []
	}
	while (targetElement && targetElement !== container) {
		const elementProps = targetElement[elementPropsKey]
		if (elementProps) {
			const callbackNameList = getEventCallbackNameFromEventType(eventType)
			if (callbackNameList) {
				callbackNameList.forEach((callbackName, i) => {
					const eventCallback = elementProps[callbackName]
					if (eventCallback) {
						if (i === 0) {
							paths.capture.unshift(eventCallback)
						} else {
							paths.bubble.push(eventCallback)
						}
					}
				})
			}
		}
		targetElement = targetElement.parentNode as DOMElement
	}
	return paths
}
