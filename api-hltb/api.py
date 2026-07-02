import os
from flask import Flask, jsonify
from flask_cors import CORS
from howlongtobeatpy import HowLongToBeat

app = Flask(__name__)

# --- Configuração de CORS Dinâmica ---
origins = os.environ.get('CORS_ORIGIN', '').split(',')
if not origins or origins == ['']:
    print("AVISO: A variável de ambiente CORS_ORIGIN não está definida. CORS não estará ativo.")
CORS(app, resources={r"/*": {"origins": origins}})

# Quantos candidatos no máximo devolver numa busca por título.
MAX_RESULTS = 15


def serialize(entry):
    """Converte um HowLongToBeatEntry no formato que o app consome."""
    return {
        "hltb_id": entry.game_id,
        "name": entry.game_name,
        "year": entry.release_world,        # ano de lançamento (pode ser None)
        "image_url": entry.game_image_url,
        "similarity": entry.similarity,
        "times": {
            "main_story": entry.main_story,
            "main_extra": entry.main_extra,
            "completionist": entry.completionist,
        },
    }


@app.route('/howlongtobeat/search/<query>', methods=['GET'])
def search_games(query):
    """Busca por título e devolve vários candidatos, pra desambiguação no cliente.

    Ordenado por similaridade (mais parecido com o termo buscado primeiro).
    Jogos de mesmo nome (ex: remake) vêm juntos e se distinguem pelo `year`.
    """
    try:
        results = HowLongToBeat().search(query) or []
        results.sort(key=lambda e: e.similarity or 0, reverse=True)
        return jsonify({"results": [serialize(e) for e in results[:MAX_RESULTS]]})
    except Exception as e:
        print(f"Erro na busca HLTB: {e}")
        return jsonify({"error": "Erro ao buscar no HowLongToBeat", "details": str(e)}), 500


@app.route('/howlongtobeat/game/<int:game_id>', methods=['GET'])
def game_by_id(game_id):
    """Busca exata por id do HLTB — usado pelo escape hatch de colar link/id."""
    try:
        entry = HowLongToBeat().search_from_id(game_id)
        if entry is None:
            return jsonify({"error": f"Jogo com id {game_id} não encontrado"}), 404
        return jsonify(serialize(entry))
    except Exception as e:
        print(f"Erro ao buscar HLTB por id: {e}")
        return jsonify({"error": "Erro ao buscar no HowLongToBeat", "details": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True)
