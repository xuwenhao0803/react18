import { getBaseRollupPlugins, getPackageJSON, resolvePKgPath } from './utils'
import generagePackageJson from 'rollup-plugin-generate-package-json'
import alias from '@rollup/plugin-alias'
const { name, module } = getPackageJSON('react-dom')
// react-dom包的路径
const pkgPath = resolvePKgPath(name)
// react-dom产物路径
const pkgDistPath = resolvePKgPath(name, true)

export default [
	{
		input: `${pkgPath}/${module}`,
		output: [
			{
				file: `${pkgDistPath}/index.js`,
				name: 'index.js',
				format: 'umd'
			},
			{
				file: `${pkgDistPath}/client.js`,
				name: 'client.js',
				format: 'umd'
			}
		],
		plugins: [
			...getBaseRollupPlugins({
				typescript: {
					check: false
				}
			}),
			alias({
				entries: {
					hostconfig: `${pkgPath}/src/hostconfig.ts`
				}
			}),
			//webpack resolve alias
			generagePackageJson({
				inputFolder: pkgPath,
				outputFolder: pkgDistPath,
				baseContents: ({ name, description, version }) => ({
					name,
					description,
					version,
					peerDependencies: {
						react: version
					},
					main: 'index.js'
				})
			})
		]
	}
]
