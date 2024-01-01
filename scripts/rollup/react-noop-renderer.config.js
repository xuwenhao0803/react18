import { getBaseRollupPlugins, getPackageJSON, resolvePKgPath } from './utils'
import generatePackageJson from 'rollup-plugin-generate-package-json'
import alias from '@rollup/plugin-alias'
const { name, module, peerDependencies } = getPackageJSON('react-noop-renderer')
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
				name: 'ReactNoopRenderer',
				format: 'umd'
			}
		],
		external: [...Object.keys(peerDependencies), 'scheduler'],
		plugins: [
			...getBaseRollupPlugins({
				typescript: {
					exclude: ['./packages/react-dom/**/*'],
					tsconfigOverride: {
						compilerOptions: {
							paths: {
								hostConfig: [`./${name}/src/hostConfig.ts`]
							}
						}
					}
				}
			}),
			alias({
				entries: {
					hostConfig: `${pkgPath}/src/hostConfig.ts`
				}
			}),
			generatePackageJson({
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
