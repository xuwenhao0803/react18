import { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'

function App() {
	const [num, setNum] = useState(1)

	useEffect(() => {
		console.log('APP mount')
	}, [])

	useEffect(() => {
		console.log('num change create', num)
		return () => {
			console.log('num change destory')
		}
	}, [num])

	return (
		<ul
			onClick={() => {
				setNum(num + 1)
				setNum(num + 1)
				setNum(num + 1)
			}}
		>
			<li>4</li>
			<li>5</li>
			{num}
			{num === 1 && <Child />}
		</ul>
	)
}

function Child() {
	useEffect(() => {
		console.log('child mount')
		return () => {
			console.log('child unmount')
		}
	}, [])
	return <span>big-react</span>
}
const root = document.querySelector('#root')
ReactDOM.createRoot(root).render(<App />)
