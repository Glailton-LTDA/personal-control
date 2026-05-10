import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      pt: {
        translation: {
          settings: {
            title: 'Ajustes',
            general: 'Geral',
            security: 'Segurança',
            customization: 'Personalização',
            customization_desc: 'Escolha a aparência do seu Orbit',
            navigation: 'Navegação',
            navigation_desc: 'Arranje os itens do menu lateral',
            system: 'E-mail e Sistema',
            system_desc: 'Automações e notificações de pagamento',
            vault: 'Alterar Senha',
            vault_desc: 'Atualize suas credenciais',
            maintenance: 'Manutenção',
            maintenance_desc: 'Reparo profundo de dados',
            save: 'Salvar Configurações',
            saving: 'Salvando...',
            success: 'Configurações salvas com sucesso!',
            language: 'Idioma',
            language_desc: 'Selecione sua preferência regional',
            themes: {
              light: 'Modo Claro',
              dark: 'Modo Escuro'
            },
            options: {
              skip_modal: 'Pular modal de e-mail',
              skip_modal_desc: 'Envia direto para o principal',
              skip_confirm: 'Pular confirmações',
              skip_confirm_desc: 'Ações de exclusão instantâneas',
              auto_send: 'E-mail automático ao pagar',
              auto_send_desc: 'Automatiza o disparo no clique'
            }
          }
        }
      },
      en: {
        translation: {
          settings: {
            title: 'Settings',
            general: 'General',
            security: 'Security',
            customization: 'Customization',
            customization_desc: 'Choose your Orbit appearance',
            navigation: 'Navigation',
            navigation_desc: 'Arrange sidebar menu items',
            system: 'Email & System',
            system_desc: 'Automations and payment notifications',
            vault: 'Change Password',
            vault_desc: 'Update your credentials',
            maintenance: 'Maintenance',
            maintenance_desc: 'Deep data repair',
            save: 'Save Settings',
            saving: 'Saving...',
            success: 'Settings saved successfully!',
            language: 'Language',
            language_desc: 'Select your regional preference',
            themes: {
              light: 'Light Mode',
              dark: 'Dark Mode'
            },
            options: {
              skip_modal: 'Skip email modal',
              skip_modal_desc: 'Sends directly to primary email',
              skip_confirm: 'Skip confirmations',
              skip_confirm_desc: 'Instant delete actions',
              auto_send: 'Auto-send on payment',
              auto_send_desc: 'Automates dispatch on click'
            }
          }
        }
      }
    },
    fallbackLng: 'pt',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
