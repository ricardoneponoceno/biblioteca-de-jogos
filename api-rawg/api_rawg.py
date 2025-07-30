import os
from flask import Flask, jsonify
from flask_cors import CORS
import requests

# COMENTADO PARA PUBLICACAO WEB
#from config import RAWG_API_KEY # <-- IMPORTA A CHAVE DO config.py
# --- CONFIGURAÇÃO ---

# NOVO TRECHO PARA PUBLICACAO WEB
#from dotenv import load_dotenv

#load_dotenv() # Carrega as variáveis de um arquivo .env para testes locais
RAWG_API_KEY = os.environ.get('RAWG_API_KEY')


# Inicializa a aplicação Flask
app = Flask(__name__)

# Habilita o CORS para permitir que sua outra aplicação acesse esta API
CORS(app)

# --- FUNÇÃO DA ROTA DA API ---
@app.route('/rawg/<string:game_name>')
def get_rawg_data(game_name):
    """
    Busca os dados de um jogo na RAWG API e retorna como JSON.
    """
    if not RAWG_API_KEY or RAWG_API_KEY == "SUA_CHAVE_DE_API_AQUI":
        return jsonify({"error": "A chave da API da RAWG não foi configurada no servidor."}), 500

    url_base = "https://api.rawg.io/api/games"
    params = {
        "key": RAWG_API_KEY,
        "search": game_name,
        "page_size": 1
    }

    try:
        response = requests.get(url_base, params=params)
        response.raise_for_status() # Lança erro para respostas 4xx/5xx

        data = response.json()

        if data.get('results'):
            jogo = data['results'][0]
            
            # Monta a resposta que queremos enviar
            dados_formatados = {
                #"name": jogo.get('name'),
                "released": jogo.get('released'),
                "metacritic": jogo.get('metacritic')#,
                #"background_image": jogo.get('background_image'),
                #"platforms": [p['platform']['name'] for p in jogo.get('platforms', [])],
                #"genres": [g['name'] for g in jogo.get('genres', [])]
            }
            return jsonify(dados_formatados)
        else:
            return jsonify({"error": f"Jogo '{game_name}' não encontrado."}), 404

    except requests.exceptions.RequestException as e:
        return jsonify({"error": "Erro ao contatar a API da RAWG.", "details": str(e)}), 500

# Este bloco só é executado se você rodar "python api_rawg.py" diretamente
if __name__ == '__main__':
    # Usamos a porta 3003 aqui para testes locais
    app.run(host='0.0.0.0', port=3003, debug=True)