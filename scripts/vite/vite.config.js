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
		alias: [
			{
				find: 'react',
				replacement: resolvePKgPath('react')
			},
			{
				find: 'react-dom',
				replacement: resolvePKgPath('react-dom')
			},
			{
				find: 'react-noop-renderer',
				replacement: resolvePKgPath('react-noop-renderer')
			},
			{
				find: 'hostConfig',
				replacement: path.resolve(
					resolvePKgPath('react-noop-renderer'),
					'./src/hostConfig.ts'
				)
			}
		]
	}
})
