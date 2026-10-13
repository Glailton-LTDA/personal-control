/** Ícones, cores e utilitários das categorias (árvore/busca/avatar). */

/** Grade de ícones do seletor — emojis, como no Minhas Finanças original. */
export const MF_CATEGORY_ICONS = [
  '🍔', '🍕', '🎂', '☕', '🍺', '🍸', '🍎', '🥗',
  '🛒', '⚽', '🏋️', '🚴', '🎮', '🎬', '🎵', '📚',
  '💼', '💰', '💳', '🏠', '🏡', '🔧', '💡', '🧹',
  '🚗', '🚌', '🚲', '✈️', '🐶', '🐱', '🌱', '🌸',
  '🎁', '💊', '🏥', '👕', '💻', '📱', '📖', '🎯',
  '🍜', '🍣', '🥪', '🌮', '🍩', '🧀', '🥞', '🍦',
  '🍌', '🥑', '🥩', '🐟', '🥚', '🧉', '🍵', '🥤',
  '🍾', '🥃', '🏦', '📈', '📉', '🪙', '🏷️', '📦',
  '🛍️', '👜', '💎', '🧾', '🛋️', '🛏️', '🪴', '🚿',
  '⛽', '🏗️', '🧰', '🛡️', '🚕', '🚆', '🛵', '⛵',
  '🚀', '🗺️', '🏖️', '⛰️', '⚾', '🏀', '🎾', '🥋',
  '🎭', '🎤', '🎸', '🎹', '📻', '📺', '📷', '✏️',
  '🎒', '🎓', '🔬', '🧪', '🌍', '📝', '📄', '🏢',
  '🏫', '💉', '🧠', '👓', '✂️', '💅', '🦷', '🐾',
  '🦴', '🐠', '🎄', '🎃', '💍', '👶', '🧸', '⚡',
  '💧', '🔥', '🪪', '🚑', '🧦', '🛗', '🏛️', '📊',
  '🏍️', '🚙', '🛻', '🚚', '🚜', '🅿️', '🔋', '🛣️',
  '🚦', '🧽', '🏎️', '🚁', '🥘', '🫔', '🍱', '🥟',
  '🧋', '🧁', '🍿', '🥜', '🍯', '🚪', '🪟', '🧺',
  '🧴', '🧻', '🪠', '🪞', '🐕', '🐈', '🤑', '💸',
  '🏧', '📑', '🧮', '🩺', '🩹', '🌡️', '💆', '🧘',
  '🍼', '🪁', '📎', '🖨️', '📅', '📌', '👗', '🧥',
  '👟', '🥾', '🧢', '🎧', '⌨️', '🔊', '🧳', '🙏',
  '💒', '🍷', '🥂', '🐖',
  '🐼', '🦁', '🍽️', '🌊', '🏞️', '🪕', '👨', '👩',
  '🧒', '👧', '🇧🇷', '🇺🇸', '🇪🇺', '🇵🇹', '🇦🇷', '🇺🇾',
  '🇨🇱', '🇵🇾', '🇪🇸', '🇮🇹', '🇯🇵', '🇨🇳', 'R$', 'US$',
  '€', '🍳', '👔', '👖', '🩳', '🤵', '👦', '🧓',
  '👴', '👵', '👪', '👨‍👩‍👧‍👦', '👨‍👩‍👦', '👩‍👧‍👦', '👨‍👧‍👦', '👚',
];

/**
 * Palavras-chave da busca de ícone (minúsculas, sem acento — a busca
 * normaliza o termo com `mfNormalize`). Cobre a grade inteira para dar
 * para achar ex.: "combustivel" → ⛽.
 */
export const MF_ICON_KEYWORDS = {
  '🍔': 'lanche hamburguer fast food lanchonete',
  '🍕': 'pizza pizzaria',
  '🎂': 'bolo aniversario festa parabens',
  '☕': 'cafe cafeteria coffee',
  '🍺': 'cerveja bar chopp pub',
  '🍸': 'drink coquetel bar',
  '🍷': 'vinho taca adega',
  '🥂': 'brinde brindar festa ano novo espumante',
  '🍎': 'fruta maca alimentacao saudavel feira',
  '🥗': 'salada saudavel dieta',
  '🛒': 'mercado supermercado compras atacadao',
  '⚽': 'futebol esporte jogo bola',
  '🏋️': 'academia musculacao treino crossfit',
  '🚴': 'bike bicicleta ciclismo pedal',
  '🎮': 'videogame jogo game',
  '🎬': 'cinema filme serie',
  '🎵': 'musica show',
  '📚': 'livro estudo leitura escola curso',
  '💼': 'trabalho pasta reuniao escritorio',
  '💰': 'dinheiro grana cofre',
  '💳': 'cartao credito debito',
  '🏠': 'casa moradia lar aluguel',
  '🏡': 'casa jardim quintal',
  '🔧': 'manutencao conserto ferramenta reforma obra',
  '💡': 'luz lampada energia ideia conta de luz',
  '🧹': 'limpeza faxina diarista',
  '🚗': 'carro automovel veiculo',
  '🚌': 'onibus transporte passagem',
  '🚲': 'bike bicicleta',
  '✈️': 'viagem aviao passagem ferias turismo',
  '🐶': 'cachorro cao pet',
  '🐱': 'gato pet',
  '🌱': 'planta muda jardim horta',
  '🌸': 'flor',
  '🎁': 'presente',
  '💊': 'remedio farmacia remedios',
  '🏥': 'hospital medico saude exame',
  '👕': 'camisa roupa camiseta vestuario',
  '💻': 'computador notebook pc informatica',
  '📱': 'celular telefone smartphone recarga',
  '📖': 'livro leitura manual biblia',
  '🎯': 'meta alvo objetivo',
  '🍜': 'macarrao miojo lamen japones',
  '🍣': 'sushi japones japa',
  '🥪': 'sanduiche lanche',
  '🌮': 'mexicana taco burrito',
  '🍩': 'donut rosquinha doce',
  '🧀': 'queijo',
  '🥞': 'panqueca',
  '🍦': 'sorvete acai',
  '🍌': 'banana fruta',
  '🥑': 'abacate fruta',
  '🥩': 'carne churrasco acougue',
  '🐟': 'peixe pescaria',
  '🥚': 'ovo ovos',
  '🧉': 'chimarrao mate terere',
  '🍵': 'cha',
  '🥤': 'refrigerante suco milkshake',
  '🍾': 'espumante champanhe festa',
  '🥃': 'whisky dose destilado',
  '🏦': 'banco conta',
  '📈': 'investimento alta lucro acao bolsa rendimento',
  '📉': 'queda prejuizo perda baixa',
  '🪙': 'moeda cripto bitcoin',
  '🏷️': 'etiqueta preco promocao desconto oferta',
  '📦': 'caixa encomenda correio entrega mudanca',
  '🛍️': 'compras shopping sacola loja',
  '👜': 'bolsa carteira',
  '💎': 'joia diamante luxo',
  '🧾': 'nota fiscal recibo cupom comprovante',
  '🛋️': 'sofa sala mobilia moveis',
  '🛏️': 'cama quarto hotel hospedagem',
  '🪴': 'planta vaso jardim flor',
  '🚿': 'banho chuveiro encanador',
  '⛽': 'combustivel gasolina etanol diesel posto bomba fuel abastecer',
  '🏗️': 'obra construcao reforma pedreiro',
  '🧰': 'ferramenta caixa manutencao conserto',
  '🛡️': 'seguro protecao',
  '🚕': 'taxi uber corrida aplicativo',
  '🚆': 'trem metro cptm',
  '🛵': 'moto scooter motoboy entrega',
  '⛵': 'barco velejar lancha',
  '🚀': 'foguete',
  '🗺️': 'mapa viagem roteiro passeio',
  '🏖️': 'praia ferias viagem mar',
  '⛰️': 'montanha trilha serra',
  '⚾': 'beisebol esporte',
  '🏀': 'basquete esporte',
  '🎾': 'tenis esporte',
  '🥋': 'luta judo karate academia',
  '🎭': 'teatro peca show cultura',
  '🎤': 'karaoke show microfone',
  '🎸': 'violao guitarra instrumento',
  '🎹': 'piano teclado instrumento aula',
  '📻': 'radio',
  '📺': 'tv televisao streaming assinatura netflix',
  '📷': 'foto camera fotografia',
  '✏️': 'lapis escrita papelaria',
  '🎒': 'mochila escola material',
  '🎓': 'faculdade formatura curso universidade',
  '🔬': 'ciencia pesquisa laboratorio',
  '🧪': 'laboratorio exame analise',
  '🌍': 'mundo viagem planeta passagem',
  '📝': 'anotacao escrita bloco lembrete',
  '📄': 'documento papel contrato boleto',
  '🏢': 'empresa escritorio predio comercial trabalho',
  '🏫': 'escola mensalidade curso',
  '💉': 'vacina injecao exame sangue laboratorio',
  '🧠': 'mente psicologo terapia saude mental',
  '👓': 'oculos otica lente',
  '✂️': 'costura corte cabelo barbeiro salao',
  '💅': 'manicure unha salao beleza',
  '🦷': 'dentista dente odonto aparelho',
  '🐾': 'pet pata cao gato veterinario',
  '🦴': 'osso cachorro pet',
  '🐠': 'peixe aquario',
  '🎄': 'natal festa dezembro',
  '🎃': 'halloween festa fantasia',
  '💍': 'anel alianca casamento noivado joia',
  '👶': 'bebe filho crianca fralda creche',
  '🧸': 'brinquedo pelucia crianca',
  '⚡': 'energia eletricidade luz conta',
  '💧': 'agua conta saneamento',
  '🔥': 'gas fogo churrasco botijao',
  '🪪': 'documento identidade rg cnh carteira',
  '🚑': 'ambulancia emergencia upa samu',
  '🧦': 'meia roupa',
  '🛗': 'elevador condominio',
  '🏛️': 'banco governo cartorio imposto taxa',
  '📊': 'grafico relatorio estatistica planilha',
  '🏍️': 'moto motocicleta motoboy',
  '🚙': 'carro suv automovel',
  '🛻': 'caminhonete pickup carro',
  '🚚': 'caminhao frete mudanca entrega transportadora',
  '🚜': 'trator roca fazenda sitio',
  '🅿️': 'estacionamento vaga carro estacionar zona azul',
  '🔋': 'bateria pilha carga energia celular',
  '🛣️': 'estrada rodovia pedagio viagem',
  '🚦': 'semaforo transito multa',
  '🧽': 'lavagem carro lava jato limpeza esponja',
  '🏎️': 'corrida formula 1 kart velocidade',
  '🚁': 'helicoptero voo',
  '🥘': 'paella comida panela restaurante almoco janta',
  '🫔': 'tamal pamonha comida',
  '🍱': 'bento marmita japones almoco',
  '🥟': 'pastel dumpling salgado',
  '🧋': 'bubble tea cha gelado',
  '🧁': 'cupcake muffin bolo doce',
  '🍿': 'pipoca cinema filme',
  '🥜': 'amendoim castanha nozes petisco',
  '🍯': 'mel pote doce',
  '🚪': 'porta entrada reforma casa',
  '🪟': 'janela vidro reforma',
  '🧺': 'cesto roupa lavanderia cesto',
  '🧴': 'shampoo cosmetico higiene beleza perfume',
  '🧻': 'papel higienico banheiro',
  '🪠': 'desentupidor encanador pia vaso',
  '🪞': 'espelho banheiro quarto',
  '🐕': 'cachorro cao pet passeio adestramento',
  '🐈': 'gato pet areia racao',
  '🤑': 'rico dinheiro lucro bonus',
  '💸': 'gasto dinheiro transferencia envio pix',
  '🏧': 'caixa eletronico saque atm dinheiro',
  '📑': 'papelada documento boleto contrato',
  '🧮': 'calculadora conta calculo',
  '🩺': 'medico estetoscopio consulta clinica',
  '🩹': 'curativo machucado band aid farmacia',
  '🌡️': 'febre temperatura termometro',
  '💆': 'massagem relaxar spa bem estar',
  '🧘': 'yoga meditacao bem estar academia',
  '🍼': 'mamadeira bebe leite filho',
  '🪁': 'pipa papagaio lazer parque',
  '📎': 'clipe papelaria escritorio papel',
  '🖨️': 'impressora impressao xerox papelaria',
  '📅': 'agenda calendario compromisso',
  '📌': 'alfinete lembrete fixar aviso mural',
  '👗': 'vestido roupa festa',
  '🧥': 'casaco jaqueta frio blusa moletom',
  '👟': 'tenis calcado corrida academia sapato',
  '🥾': 'bota trilha sapato chuva',
  '🧢': 'bone chapeu acessorio',
  '🎧': 'fone ouvido musica headset',
  '⌨️': 'teclado digitacao computador',
  '🔊': 'som caixa som volume festa evento',
  '🧳': 'mala viagem bagagem ferias passeio',
  '🙏': 'igreja oracao reza fe dizimo culto missa',
  '💒': 'casamento igreja cerimonia festa',
  '🐖': 'cofrinho poupanca economia reserva guardar',
  '🐼': 'panda urso china bambu',
  '🦁': 'leao rei selva africa safari',
  '🍽️': 'comida prato refeicao almoco janta restaurante garfo faca',
  '🌊': 'mar praia onda agua piscina cachoeira',
  '🏞️': 'cachoeira natureza parque trilha cascata',
  '🪕': 'cavaquinho banjo viola musica sertanejo instrumento',
  '👨': 'homem pai marido senhor',
  '👩': 'mulher mae esposa senhora',
  '🧒': 'crianca filho menino',
  '👧': 'crianca filha menina',
  '🇧🇷': 'brasil bandeira pais',
  '🇺🇸': 'estados unidos eua america bandeira pais dolar',
  '🇪🇺': 'europa uniao europeia euro bandeira',
  '🇵🇹': 'portugal bandeira pais',
  '🇦🇷': 'argentina bandeira pais',
  '🇺🇾': 'uruguai bandeira pais',
  '🇨🇱': 'chile bandeira pais',
  '🇵🇾': 'paraguai bandeira pais',
  '🇪🇸': 'espanha bandeira pais',
  '🇮🇹': 'italia bandeira pais',
  '🇯🇵': 'japao bandeira pais',
  '🇨🇳': 'china bandeira pais',
  'R$': 'real brasil moeda dinheiro brl',
  'US$': 'dolar americano eua moeda dinheiro usd',
  '€': 'euro europa moeda dinheiro eur',
  '🍳': 'frigideira fritura ovo cozinha fogao',
  '👔': 'gravata camisa social trabalho formatura',
  '👖': 'calca jeans roupa moda',
  '🩳': 'bermuda shorts roupa moda praia',
  '🤵': 'terno smoking noivo formatura noivado',
  '👦': 'menino filho crianca',
  '🧓': 'avo idoso',
  '👴': 'avo idoso',
  '👵': 'avo idosa',
  '👪': 'familia pai mae filho',
  '👨‍👩‍👧‍👦': 'familia pai mae filho filha',
  '👨‍👩‍👦': 'familia pai mae filho',
  '👩‍👧‍👦': 'familia mae filho filha',
  '👨‍👧‍👦': 'familia pai filho filha',
  '👚': 'blusa camisa roupa moda feminina',
};

/** Busca de ícone: termo normalizado (sem acento/caixa) nas palavras-chave. */
export function mfIconMatches(emoji, term) {
  const needle = mfNormalize(term).trim();
  if (!needle) return true;
  return mfNormalize(MF_ICON_KEYWORDS[emoji] ?? '').includes(needle);
}

/** Paleta do seletor — a primeira é o padrão de novas categorias. */
export const MF_CATEGORY_COLORS = [
  '#6366f1', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280', '#111827',
  '#f43f5e', '#a855f7', '#0ea5e9', '#84cc16', '#d97706', '#78350f',
  '#64748b', '#34d399',
];

/** Cores de fallback (categorias migradas sem cor) — determinísticas. */
const FALLBACK_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
];

/** Cor da categoria: a salva ou um fallback estável pelo nome. */
export function mfCategoryColor(category) {
  if (category?.color) return category.color;
  const name = String(category?.name ?? '');
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

/** Inicial exibida quando a categoria não tem ícone escolhido. */
export function mfCategoryInitial(name) {
  return String(name ?? '').trim().charAt(0).toUpperCase() || '?';
}

/** Normaliza texto para busca sem acento/caixa. */
export function mfNormalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Monta a árvore (raízes com `children`) a partir da lista plana.
 * Filho cujo pai não está na lista (arquivado/excluído) vira raiz — a
 * mesma régua de "órfãs" do formulário de lançamento.
 */
export function mfCategoryTree(categories = []) {
  const ids = new Set(categories.map((cat) => cat.id));
  const roots = categories.filter((cat) => !cat.parent_id || !ids.has(cat.parent_id));
  const childrenOf = (id) => categories.filter((cat) => cat.parent_id === id);
  return roots.map((root) => ({ ...root, children: childrenOf(root.id) }));
}

/**
 * Filtra a árvore por termo de busca: mantém a raiz se ela ou algum
 * filho casa; se só o filho casa, mostra apenas os filhos que casam.
 */
export function mfFilterTree(tree, term) {
  const needle = mfNormalize(term);
  if (!needle) return tree;
  return tree
    .map((node) => {
      const rootHit = mfNormalize(node.name).includes(needle);
      const children = node.children.filter(
        (child) => rootHit || mfNormalize(child.name).includes(needle)
      );
      if (!rootHit && children.length === 0) return null;
      return { ...node, children: rootHit ? node.children : children };
    })
    .filter(Boolean);
}
