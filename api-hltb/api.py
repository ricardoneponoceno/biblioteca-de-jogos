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


@app.route('/howlongtobeat/<game_name>', methods=['GET'])
def get_game_data(game_name):
    try:
        results_list = HowLongToBeat().search(game_name)

        if results_list is not None and len(results_list) > 0:
            best_result = results_list[0]
            
            response_data = {
                "image_url": best_result.game_image_url,
                "name": best_result.game_name,
                "times": {
                    "main_story": best_result.main_story,
                    "main_extra": best_result.main_extra,
                    "completionist": best_result.completionist
                }
            }
            return jsonify(response_data)
        else:
            return jsonify({"error": "Jogo não encontrado"}), 404

    except Exception as e:
        print(f"Ocorreu um erro: {e}")
        return jsonify({"error": "Ocorreu um erro interno", "details": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)