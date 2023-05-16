require 'json'

handler_path, handler_name, lambdaName, timeout = ARGV
require(handler_path)

class LambdaContext
  attr_reader :function_name, :function_version, :aws_request_id, :log_stream_name, :memory_limit_in_mb,
    :invoked_function_arn, :log_group_name, :deadline_ms

  def initialize(lambdaName, timeout, awsRequestId)
    @function_name = lambdaName
    @function_version = "$LATEST"
    @memory_limit_in_mb = ENV['AWS_LAMBDA_FUNCTION_MEMORY_SIZE']
    @timeout = timeout.to_i

    @aws_request_id = awsRequestId
    @invoked_function_arn = "arn:aws:lambda:aws-region:123456789012:function:#{@function_name}"
    @log_group_name = "/aws/lambda/#{@function_name}"
    @log_stream_name = Time.now.strftime('%Y/%m/%d') +'/[$' + @function_version + ']58419525dade4d17a495dceeeed44708'

    @created_time = Time.now
    @deadline_ms = (@created_time + @timeout).to_i * 1000
  end

  def get_remaining_time_in_millis
    [@timeout * 1000 - ((Time.now - @created_time) * 1000).round, 0].max
  end

  def log(message)
    puts message
  end
end


handler_method, handler_class = handler_name.split('.').reverse
handler_class ||= "Kernel"


input = ""
while (line = STDIN.gets)
  input += line
  begin
    json_input = JSON.parse(input)
    context = LambdaContext.new(lambdaName, timeout, json_input['awsRequestId'])
    response = Object.const_get(handler_class).send(handler_method, event: json_input['event'], context: context)
    json_response = JSON.generate(response)
    $stdout.flush
    puts "__|response|__#{json_response}"
    $stdout.flush
  rescue Exception => e
    error_type = e.class.to_s
    error_message = e.message
    stack_trace = e.backtrace.join("\n")
    json_err = JSON.generate({
      'errorType' => error_type,
      'errorMessage' => error_message,
      'stackTrace' => stack_trace
    })
    $stderr.puts("__|error|__#{json_err}")
  ensure
    input = ''
  end
end