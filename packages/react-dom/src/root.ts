// ReactDOM.createRoot(root).render(<App/>)

import {
	createContainer,
	updateContainer
} from 'react-reconciler/src/fiberReconciler'
import { Container } from './hostConfig'
import { ReactElementType } from 'shared/ReactTypes'
import { initEvent } from './SyntheticEvent'

export function createRoot(conatiner: Container) {
	const root = createContainer(conatiner)

	return {
		render(element: ReactElementType) {
			initEvent(conatiner, 'click')
			return updateContainer(element, root)
		}
	}
}
