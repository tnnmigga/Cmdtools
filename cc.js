const path = require('path')
const fs = require('fs');

const default_type_list = [
    //-------- c/c++ ---------
    'c',
    'cpp',
    'h',
    'hpp',

    //-------- c# ------------
    'cs',
    //-------- java ----------
    'java',

    //-------- python --------
    'py',

    //-------- typescript ----
    'ts',

    //-------- javascript ----
    'js',

    //-------- html/css ------
    'html',
    'css',

    //-------- lua -----------
    'lua',

    //-------- matlab --------
    'm',

    //-------- go ------------
    'go',

    //-------- php -----------
    'php',

    //-------- other ---------
    'txt',
];

const config = {
    maxLength: 40,
    fixed: 3,
    units: ['B', 'KB', 'MB', 'GB', 'TB', 'PB'],
}

var code_statistic_data = {
    total_line_num: 0,
    total_char_num: 0,
    ignore_list: [],
    success_list: [],
    fail_list: [],
    type_list: {},
    option: {}
}

var statistic_code = function (filename) {
    return new Promise((resolve, reject) => {
        fs.readFile(filename, (error, data) => {
            if (error) {
                reject(error);
            }
            resolve(data.toString());
        })
    })
    .then(
        (code) => {
            let char_num = code.length;
            let line_num = 1;
            for (let iter of code) {
                if (iter == '\n') {
                    line_num++;
                }
            }
            code_statistic_data.success_list.push({
                filename,
                char_num,
                line_num
            });
            code_statistic_data.total_char_num += char_num;
            code_statistic_data.total_line_num += line_num;
        },
        (error) => {
            code_statistic_data.fail_list.push({
                filename,
                error: error.toString(),
            });
        }
    )
}

var check_type = function (filename) {
    let type = filename.slice(filename.lastIndexOf('.') + 1);
    return code_statistic_data.type_list[type];
}

var analyse_directory = function (pwd) {
    let promises = [];
    let directory = fs.readdirSync(pwd);
    for (let iter of directory) {
        let filename = path.join(pwd, iter);
        let stat = fs.lstatSync(filename);
        if (stat.isDirectory()) {
            let sub_promises = analyse_directory(filename);
            promises.push(...sub_promises);
        }
        else {
            if (check_type(filename)) promises.push(statistic_code(filename));
            else code_statistic_data.ignore_list.push({ filename });
        }
    }
    return promises;
}

var init = function () {
    for (let type of default_type_list) {
        code_statistic_data.type_list[type] = true;
    }

    if (!Promise.allSettled) {
        Promise.allSettled = function (promises) {
            return new Promise(resolve => {
                const data = [], len = promises.length;
                let count = len;
                for (let i = 0; i < len; i += 1) {
                    const promise = promises[i];
                    promise.then(res => {
                        data[i] = {
                            status: 'fulfilled',
                            value: res
                        };
                    }, error => {
                        data[i] = {
                            status: 'rejected',
                            reason: error
                        };
                    }).finally(() => { // promise has been settled
                        if (!--count) {
                            resolve(data);
                        }
                    });
                }
            });
        }
    }
}

var format_data = function (line_num, char_num) {
    const units = config.units;
    const index = Math.floor(Math.log2(char_num) / 10);
    const util = units[index];
    const size = index ? (char_num / Math.pow(1024, index)).toFixed(config.fixed) : char_num;
    return `lines: ${line_num}  size: ${size} ${util}`;
}

var print_line = function (data, fill_char) {
    const maxLength = config.maxLength;
    data = data || '';
    fill_char = fill_char || ' ';
    if (data.length > maxLength) {
        data = data.slice(maxLength - data.length + 10);
    }
    console.log(data.padEnd(maxLength, fill_char) + '/');
}

var empty_line = function () {
    return print_line('', '-');
}

var main = function () {
    let argv = process.argv.slice(2);
    let remain = [];
    let index = 0;
    while (index < argv.length) {
        if (argv[index] == '-l' || argv[index] == '--list') {
            code_statistic_data.option.log_success_list = true;
            code_statistic_data.option.log_fail_list = true;
            code_statistic_data.option.log_ignore_list = true;
            index++;
        }
        else if (argv[index] == '-t' || argv[index] == '--type') {
            code_statistic_data.type_list = {};
            while (++index < argv.length) {
                if (argv[index][0] != '-') {
                    code_statistic_data.type_list[argv[index]] = true;
                }
                else break;
            }
        }
        else if (argv[index] == '-sl') {
            code_statistic_data.option.log_success_list = true;
            index++;
        }
        else if (argv[index] == '-fl') {
            code_statistic_data.option.log_fail_list = true;
            index++;
        }
        else if (argv[index] == '-il') {
            code_statistic_data.option.log_ignore_list = true;
            index++;
        }
        else remain.push(argv[index++]);
    }
    if (remain.length > 1) {
        console.log("Wrong argv !!!");
        return;
    }

    let target = remain[0] || '.';
    let stat;
    try {
        stat = fs.lstatSync(target);
    } catch (error) {
        console.error(error.toString());
        return;
    }
    let promise;
    if (stat.isDirectory) promise = Promise.allSettled(analyse_directory(target));
    else promise = statistic_code(target);

    promise.then(() => {
        empty_line();
        let pwd = path.resolve(target)
        print_line('pwd: ' + pwd);
        empty_line();

        print_line(`stats file number: ${code_statistic_data.success_list.length}`)

        print_line(format_data(code_statistic_data.total_line_num, code_statistic_data.total_char_num));
        empty_line();

        if (code_statistic_data.option.log_success_list) {
            print_line('stats success list:');
            empty_line();
            let list = code_statistic_data.success_list.sort((a, b) => b.char_num - a.char_num);
            for (let file of list) {
                let filename = path.resolve(file.filename).slice(pwd.length + 1);
                print_line(filename + ':');
                print_line(format_data(file.line_num, file.char_num));
            }
            if (list.length == 0) print_line('empty !!!');
            empty_line();
        }
        if (code_statistic_data.option.log_fail_list) {
            print_line('stats fail list:');
            empty_line();
            let list = code_statistic_data.fail_list;
            for (let file of list) {
                print_line(file.filename);
            }
            if (list.length == 0) print_line('empty !!!');
            empty_line();
        }
        if (code_statistic_data.option.log_ignore_list) {
            print_line('ignore list:');
            empty_line();
            let list = code_statistic_data.ignore_list;
            for (let file of list) {
                print_line(file.filename);
            }
            if (list.length == 0) print_line('empty !!!');
            empty_line();
        }
    })
}

init();
main();