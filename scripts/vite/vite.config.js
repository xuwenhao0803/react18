import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import replace from '@rollup/plugin-replace'
import { resolvePKgPath } from '../rollup/utils'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		react(),
		replace({
			__DEV__: true,
			preventAssignment: true
		})
	],
	resolve: {
		alisa: [
			{
				find: 'react',
				replacement: resolvePKgPath('react')
			},
			{
				find: 'react-dom',
				replacement: resolvePKgPath('react-dom')
			},
			{
				find: 'hostConfig',
				replacement: path.resolve(
					resolvePKgPath('react-dom'),
					'./src/hostConfig.ts'
				)
			}
		]
	}
})
