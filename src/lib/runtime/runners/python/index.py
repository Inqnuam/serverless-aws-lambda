import decimal
import sys
import os
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


handlerPath = sys.argv[1]
handlerName = sys.argv[2]
lambdaName = sys.argv[3]
timeout = int(sys.argv[4])
sys.path.append(".")


class LambdaContext(object):
    def __init__(self, reqId="1234567890"):
        self.name = lambdaName
        self.version = "$LATEST"
        self.created = time()
        self.timeout = timeout
        self.reqId = reqId

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
        return 'arn:aws:lambda:us-east-1:123456789012:function:' + self.name

    @property
    def memory_limit_in_mb(self):
        return os.environ["AWS_LAMBDA_FUNCTION_MEMORY_SIZE"]

    @property
    def aws_request_id(self):
        return self.reqId

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

_mods = [m.__name__ for m in sys.modules.values() if m]

watchFiles = json.dumps([x for x in _mods if x.startswith("src")])
sys.stdout.write(f"__|watch|__{watchFiles}")
sys.stdout.flush()

for line in sys.stdin:
    input = json.loads(line)
    context = LambdaContext(input["awsRequestId"])  # input["context"]
    try:
        response = handler(input["event"], context)
        jsonRes = json.dumps(response, default=decimal_serializer)
        sys.stdout.flush()
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
