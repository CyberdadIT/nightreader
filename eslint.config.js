export default [{
  files:['src/**/*.{js,jsx}','scripts/**/*.mjs','tests/**/*.js'],
  languageOptions:{ecmaVersion:'latest',sourceType:'module',parserOptions:{ecmaFeatures:{jsx:true}}},
  rules:{'no-unreachable':'error','no-dupe-keys':'error','no-dupe-args':'error','valid-typeof':'error','no-unsafe-finally':'error'},
}];
