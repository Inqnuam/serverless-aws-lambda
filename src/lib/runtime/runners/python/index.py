import decimal
import sys
import json
from importlib import import_module
from time import strftime, time
import traceback


def decimal_serializer(o):
    if isinstance(o, decimal.Decimal):
        f = float(o)
        if f.is_integer():
            return int(f)
        return f


handlerDir = sys.argv[1]
handlerPath = sys.argv[2]
handlerName = sys.argv[3]
lambdaName = sys.argv[4]
timeout = int(sys.argv[5])
sys.path.append(handlerDir)


class LambdaContext(object):
    def __init__(self, name='Fake', version='LATEST', **kwargs):
        self.name = lambdaName
        self.version = version
        self.created = time()
        self.timeout = timeout
        for key, value in kwargs.items():
            setattr(self, key, value)

    def get_remaining_time_in_millis(self):
        return int(max((self.timeout * 1000) - (int(round(time() * 1000)) - int(round(self.created * 1000))), 0))

    @property
    def function_name(self):
        return self.name

    @property
    def function_version(self):
        return self.version

    @property
    def invoked_function_arn(self):
        return 'arn:aws:lambda:serverless:' + self.name

    @property
    def memory_limit_in_mb(self):
        return '1024'

    @property
    def aws_request_id(self):
        return '1234567890'

    @property
    def log_group_name(self):
        return '/aws/lambda/' + self.name

    @property
    def log_stream_name(self):
        return strftime('%Y/%m/%d') + '/[$' + self.version + ']58419525dade4d17a495dceeeed44708'

    @property
    def log(self):
        return sys.stdout.write


module = import_module(handlerPath)
handler = getattr(module, handlerName)

for line in sys.stdin:
    input = json.loads(line)
    context = LambdaContext(input["context"], {})
    try:
        response = handler(input["event"], context)
        jsonRes = json.dumps(response, default=decimal_serializer)
        sys.stdout.write(f"__|response|__{jsonRes}")
        sys.stdout.flush()
    except:
        error, ex_value, ex_traceback = sys.exc_info()

        errorType = error.__name__
        errorMessage = str(ex_value)
        stackTrace = list()
        trace_back = traceback.extract_tb(ex_traceback)

        for trace in trace_back:
            stackTrace.append("  File \"%s\", line %d, in %s\n    %s\n" % (
                trace[0], trace[1], trace[2], trace[3]))

        stackTrace.pop(0)
        jsonErr = json.dumps(
            {'errorType': errorType, 'errorMessage': errorMessage, 'stackTrace': stackTrace}, default=decimal_serializer)
        sys.stderr.write(f"__|error|__{jsonErr}")
        sys.stderr.flush()
