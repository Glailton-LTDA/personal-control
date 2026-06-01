/* global require, process, __dirname */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Helper to parse simple command arguments
const args = {};
process.argv.slice(2).forEach(arg => {
  if (arg.startsWith('--')) {
    const [key, val] = arg.split('=');
    args[key.slice(2)] = val;
  }
});

const targetDir = args.dir || 'C:\\Users\\glail\\OneDrive\\Documentos\\Cifras';
const email = args.email;
const password = args.password;

if (!email || !password) {
  console.error('Erro: Você deve especificar as credenciais de login do sistema utilizando --email e --password');
  console.log('Exemplo: node scripts/import-cifras.cjs --email=usuario@exemplo.com --password=minhasenha');
  process.exit(1);
}

// Simple parser for .env variables
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) {
    console.error('Arquivo .env não encontrado no diretório raiz.');
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, 'utf-8');
  const env = {};
  content.split('\n').forEach(line => {
    const match = line.trim().match(/^([^=]+)=(.*)$/);
    if (match) {
      env[match[1].trim()] = match[2].trim();
    }
  });
  return env;
}

const env = loadEnv();
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Credenciais do Supabase não encontradas no arquivo .env.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  }
});

console.log(`Iniciando varredura no diretório: ${targetDir}`);
if (!fs.existsSync(targetDir)) {
  console.error(`O diretório ${targetDir} não existe.`);
  process.exit(1);
}

function scanFiles(dir, filesList = []) {
  const items = fs.readdirSync(dir);
  items.forEach(item => {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanFiles(fullPath, filesList);
    } else {
      const ext = path.extname(item).toLowerCase();
      if (ext === '.txt' || ext === '.pdf') {
        filesList.push({
          fullPath,
          filename: item,
          ext
        });
      }
    }
  });
  return filesList;
}

const files = scanFiles(targetDir);
console.log(`Encontrados ${files.length} arquivos compatíveis (.txt, .pdf).`);

async function importFiles() {
  console.log(`Autenticando usuário: ${email}...`);
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (authError) {
    console.error('Erro na autenticação:', authError.message);
    process.exit(1);
  }

  const userId = authData.user.id;
  console.log(`Autenticado com sucesso! User ID: ${userId}\n`);

  let count = 0;
  for (const file of files) {
    const nameWithoutExt = path.basename(file.filename, file.ext);
    // Tenta quebrar "Artista - Título" ou usa o nome completo como título
    let artist = 'Desconhecido';
    let title = nameWithoutExt;
    
    if (nameWithoutExt.includes('-')) {
      const parts = nameWithoutExt.split('-');
      artist = parts[0].trim();
      title = parts.slice(1).join('-').trim();
    }

    let type = 'cifra';
    let content = null;
    let filePath = null;

    if (file.ext === '.txt') {
      content = fs.readFileSync(file.fullPath, 'utf-8');
    } else {
      type = 'partitura';
      filePath = file.filename; // Referência ao nome do arquivo local
    }

    try {
      const { error } = await supabase
        .from('music_songs')
        .insert({
          user_id: userId,
          title,
          artist,
          type,
          content,
          storage_type: 'local',
          file_path: filePath
        });

      if (error) {
        console.error(`Erro ao importar [${file.filename}]:`, error.message);
      } else {
        console.log(`Importado com sucesso: [${type.toUpperCase()}] ${artist} - ${title}`);
        count++;
      }
    } catch (err) {
      console.error(`Falha ao conectar para [${file.filename}]:`, err);
    }
  }
  console.log(`\nImportação concluída. Total importado: ${count}/${files.length}`);
}

importFiles();
