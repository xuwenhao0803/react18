import { useEffect, useState } from 'react'
import ReactDOM from 'react-noop-renderer'

function App() {
	return (
		<div>
			<Child />
			<div>hello world</div>
		</div>
	)
}

function Child() {
	return <span>big-react</span>
}
const root = ReactDOM.createRoot()
root.render(<App />)
window.root = root
