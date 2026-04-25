import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const GOOGLE_SCRIPT_URL = Deno.env.get('GOOGLE_SCRIPT_URL')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Tratamento de CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { to, subject, html, bcc } = await req.json()

    if (!to || !to.includes('@')) {
      throw new Error(`E-mail de destino inválido: "${to}". Verifique o cadastro do responsável.`);
    }

    console.log(`Enviando e-mail para: ${to}${bcc ? ` (BCC: ${bcc})` : ''}`);

    const res = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, html, bcc }),
    })

    const googleResponse = await res.text();
    console.log(`Resposta do Google: ${googleResponse}`);

    // Se o Google retornou um erro estruturado, vamos mostrar
    if (googleResponse.includes('"status":"error"')) {
      const errorData = JSON.parse(googleResponse);
      throw new Error(`Google Script: ${errorData.message}`);
    }

    return new Response(JSON.stringify({ status: 'sent', google: googleResponse }), { 
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
