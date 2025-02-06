import json
import time
import pupul

count = 0

def handler(event, context):

    global count
    count = count + 1
    print("Before while")

    timerCount = 0

    while timerCount < 4:
        timerCount += 1
        print(f'timerCount: {timerCount}')
        time.sleep(1)

    if count > 2:
        raise Exception("Sorry, can not visit more than 2 times.")
    return {
        'statusCode': 200,
        'body': json.dumps(f'Hello from Lambda! counter:{count}')
    }
