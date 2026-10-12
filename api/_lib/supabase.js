const { createClient } = require('@supabase/supabase-js');

function obtenerSupabase() {
	const url = process.env.SUPABASE_URL;
	const clave = process.env.SUPABASE_SECRET_KEY;

	if (!url || !clave) {
		throw new Error('Falta la configuración de Supabase.');
	}

	return createClient(url, clave, {
		auth: {
			persistSession: false,
			autoRefreshToken: false,
		},
	});
}

module.exports = { obtenerSupabase };
