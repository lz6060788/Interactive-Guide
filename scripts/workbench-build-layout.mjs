export const WORKBENCH_BUILD_DIRECTORIES = [
  'dist/admin',
  'dist/automation',
  'dist/config',
  'dist/domain',
  'dist/products',
  'dist/server',
]

export const WORKBENCH_CLEAN_DIRECTORIES = [
  ...WORKBENCH_BUILD_DIRECTORIES,
  // Older server builds emitted these directories. Keep removing them so a
  // deleted import can never survive into a later package.
  'dist/platform',
  'dist/product-shell',
  'dist/shared',
]
