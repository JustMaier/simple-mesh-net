const allSuccesses = (promises) => Promise.all(promises.map(p => {
	return p.then(
		val => Promise.resolve({type: 'success', val}),
		err => Promise.resolve({type: 'error', err})
	);
})).then(
	// If '.all' resolved, we went through all promises and have success or errors
	values => Promise.resolve(values.filter(x=>x.type === 'success').map(x=>x.val))
	// we'll never have rejections.
)

export default allSuccesses;
