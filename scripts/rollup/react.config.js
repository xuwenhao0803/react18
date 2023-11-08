import { getBaseRollupPlugins, getPackageJSON, resolvePKgPath } from './utils'
import generagePackageJson from 'rollup-plugin-generate-package-json'

const { name, module } = getPackageJSON('react')

const pkgPath = resolvePKgPath(name)

const pkgDistPath = resolvePKgPath(name, true)

export default [
	{
		input: `${pkgPath}/${module}`,
		output: {
			file: `${pkgDistPath}/index.js`,
			name: 'React',
			format: 'umd'
		},
		plugins: [
			...getBaseRollupPlugins({
				typescript: {
					check: false
				}
			}),
			generagePackageJson({
				inputFolder: pkgPath,
				outputFolder: pkgDistPath,
				baseContents: ({ name, description, version }) => ({
					name,
					description,
					version,
					main: 'index.js'
				})
			})
		]
	},
	{
		input: `${pkgPath}/src/jsx.ts`,
		output: [
			{
				file: `${pkgDistPath}/jsx-runtime.js`,
				name: 'jsx-runtime',
				format: 'umd'
			},
			{
				file: `${pkgDistPath}/jsx-dev-runtime.js`,
				name: 'jsx-dev-runtime',
				format: 'umd'
			}
		],
		plugins: getBaseRollupPlugins({
			typescript: {
				check: false
			}
		})
	}
]
