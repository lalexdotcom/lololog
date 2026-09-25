export default {
	build: {
		rolldownOptions: {
			// Vite only prints warnings; a consumer build of lololog must have none.
			onwarn(warning) {
				throw new Error(`vite warning: ${warning.message}`);
			},
		},
	},
};
